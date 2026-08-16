#!/usr/bin/env python3
"""
ComfyUI API 端到端验证 v3 — 修正 inputs 解析
"""
import json, time, uuid, urllib.request, urllib.parse, io, base64

COMFY_URL = "http://127.0.0.1:8188"
WF_FILE = r"E:\ComfyUI\COMFYUI_dapaopao\ComfyUI\user\default\workflows\02-图像精选\Z-image base开源 文生图 26-01-28.json"

SKIP_TYPES = {"Reroute", "Note", "Note Plus (mtb)", "MarkdownNote", "PrimitiveNode"}
WIDGET_NODES = {"CR Text", "CR Multiline Text", "CR Prompt Text"}  # 纯文本提供节点


def ui_to_api(ui_workflow: dict) -> dict:
    """UI 格式 → API 格式。跳过 UI 虚拟节点，塌缩 Reroute 链接"""
    nodes = ui_workflow.get("nodes", [])
    links = ui_workflow.get("links", [])
    
    node_by_id = {n["id"]: n for n in nodes}
    skip_ids = {n["id"] for n in nodes if n.get("type") in SKIP_TYPES}
    
    # link_by_target: (to_node, to_slot) → (from_node, from_slot, data_type)
    link_by_target = {}
    for ln in links:
        lid, from_n, from_s, to_n, to_s, dtype = ln
        link_by_target[(to_n, to_s)] = (from_n, from_s, dtype)
    
    def trace_link(to_node_id, to_slot):
        """追溯链接源头，跳过虚拟节点，折叠 CR Text 为字符串"""
        current = (to_node_id, to_slot)
        visited = set()
        while current in link_by_target:
            if current in visited:
                return None  # 循环引用
            visited.add(current)
            from_n, from_s, dtype = link_by_target[current]
            if from_n in skip_ids:
                # 跳过虚拟节点，继续追溯
                current = (from_n, from_s)
                continue
            upstream = node_by_id.get(from_n)
            if upstream and upstream.get("type") in WIDGET_NODES:
                # CR Text → 返回文本值
                wv = upstream.get("widgets_values", [])
                return wv[0] if wv else ""
            return [str(from_n), from_s]
        return None
    
    # 构建 API prompt
    prompt = {}
    for node in nodes:
        if node["type"] in SKIP_TYPES or node["id"] in skip_ids:
            continue
        
        nid_str = str(node["id"])
        inputs_api = {}
        inp_list = node.get("inputs", [])
        widget_vals = node.get("widgets_values", [])
        widget_idx = 0
        
        for inp_def in inp_list:
            name = inp_def.get("name", "")
            link_id = inp_def.get("link")
            
            if link_id is not None and link_id is not False:
                # 通过链接引用 → 递归追溯（自动跳过虚拟节点）
                resolved = trace_link(node["id"], inp_list.index(inp_def))
                if resolved is not None:
                    inputs_api[name] = resolved
                # 如果追溯到 CR Text 返回字符串，已经处理
            elif "widget" in inp_def and inp_def["widget"]:
                # Widget 输入 → 从 widgets_values 取值
                if widget_idx < len(widget_vals):
                    inputs_api[name] = widget_vals[widget_idx]
                    widget_idx += 1
                else:
                    inputs_api[name] = None
            else:
                inputs_api[name] = None
        
        prompt[nid_str] = {
            "class_type": node["type"],
            "inputs": inputs_api,
            "_meta": {"title": node.get("title", "")}
        }
    
    return prompt


def run_prompt(api_prompt: dict, client_id: str = "toonflow_test"):
    """提交 + 轮询，返回 outputs"""
    body = {"prompt": api_prompt, "client_id": client_id}
    data = json.dumps(body).encode()
    req = urllib.request.Request(f"{COMFY_URL}/prompt", data=data,
        headers={"Content-Type": "application/json"}, method="POST")
    
    print("  [1] 提交 prompt...")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
        pid = result.get("prompt_id")
        if not pid:
            # 检查是否有 error
            if "error" in result:
                raise Exception(json.dumps(result["error"], indent=2, ensure_ascii=False))
            raise Exception(f"未返回 prompt_id: {result}")
        print(f"  prompt_id = {pid}")
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        raise Exception(f"HTTP {e.code}: {err[:500]}")
    
    print("  [2] 轮询等待...")
    waited = 0
    while waited < 900:
        time.sleep(3)
        waited += 3
        try:
            with urllib.request.urlopen(
                urllib.request.Request(f"{COMFY_URL}/history/{pid}"), timeout=10) as resp:
                history = json.loads(resp.read())
        except:
            continue
        
        if pid in history:
            h = history[pid]
            st = h.get("status", {})
            completed = st.get("completed", False)
            status_str = st.get("status_str", "?")
            
            if not completed:
                print(f"    {status_str} ({waited}s)")
                continue
            
            outputs = h.get("outputs", {})
            print(f"  ✓ 完成! ({waited}s), 输出节点: {len(outputs)}")
            return outputs, pid
    
    raise TimeoutError("超时 (15min)")


def download_output(filename, subfolder="", otype="output"):
    params = urllib.parse.urlencode({"filename": filename, "subfolder": subfolder, "type": otype})
    with urllib.request.urlopen(urllib.request.Request(f"{COMFY_URL}/view?{params}"), timeout=60) as r:
        return r.read()


def upload_image(b64_data: str) -> str:
    if "," in b64_data:
        _, b64 = b64_data.split(",", 1)
    else:
        b64 = b64_data
    img = base64.b64decode(b64)
    boundary = f"----F{uuid.uuid4().hex[:12]}"
    fname = f"tf_{uuid.uuid4().hex[:8]}.png"
    body = io.BytesIO()
    body.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{fname}\"\r\nContent-Type: image/png\r\n\r\n".encode())
    body.write(img)
    body.write(f"\r\n--{boundary}--\r\n".encode())
    req = urllib.request.Request(f"{COMFY_URL}/upload/image", data=body.getvalue(),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())["name"]


def to_b64(data: bytes, mime="image/png") -> str:
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def main():
    print("=" * 60)
    print("ComfyUI 验证 v3")
    print("=" * 60)
    
    with open(WF_FILE, "r", encoding="utf-8") as f:
        ui = json.load(f)
    
    api = ui_to_api(ui)
    print(f"  节点: 原始{len(ui['nodes'])} → API{len(api)}")
    
    # 找到正面/负面 CLIPTextEncode
    ks = [(nid, d) for nid, d in api.items() if d["class_type"] == "KSampler"]
    pos_id = neg_id = None
    if ks:
        ki = ks[0][1]["inputs"]
        pr = ki.get("positive")
        nr = ki.get("negative")
        if isinstance(pr, list) and pr: pos_id = str(pr[0])
        if isinstance(nr, list) and nr: neg_id = str(nr[0])
    
    if pos_id:
        api[pos_id]["inputs"]["text"] = "(masterpiece, best quality:1.2), 1girl, elegant, long black hair, red dress, cherry blossoms, golden hour, cinematic, bokeh"
        print(f"\n  ✓ 正提示词 → 节点{pos_id}")
    if neg_id:
        api[neg_id]["inputs"]["text"] = "(worst quality, low quality:1.4), bad anatomy, blurry, ugly, deformed"
        print(f"  ✓ 负提示词 → 节点{neg_id}")
    
    # 随机种子
    for nid, d in api.items():
        if d["class_type"] == "KSampler":
            d["inputs"]["seed"] = int(time.time() * 1000) % 2147483647
    
    try:
        outputs, pid = run_prompt(api)
    except Exception as e:
        print(f"\n  ✗ 提交失败: {e}")
        return
    
    # 取回结果
    for nid, o in outputs.items():
        if "images" in o:
            for img in o["images"]:
                data = download_output(img["filename"], img.get("subfolder", ""), img.get("type", "output"))
                path = r"E:\workspace\Toonflow-app\data\oss\comfyui_test_output.png"
                with open(path, "wb") as f:
                    f.write(data)
                b64 = to_b64(data)
                print(f"\n  ✓ 图片: {path} ({len(data)}B, b64:{len(b64)}B)")
    
    print("\n✓ 验证通过!")

if __name__ == "__main__":
    main()
