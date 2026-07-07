const fs = require('fs');
const path = require('path');

/**
 * final-render.js — Harness 终剪节点
 * 将编剧、导演、DP、剪辑的输出汇总为成片产物。
 * 当前阶段：生成成片 JSON 描述 + 图片素材清单；如系统有 ffmpeg 则追加合成视频。
 */

function getOssDir() {
  const root = process.env.OSS_ROOT || path.join(process.cwd(), 'data', 'oss');
  return root;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

module.exports = async function main(input) {
  const { shots, plan, timeline } = input;
  const projectId = input.projectId || 0;
  const instanceId = input.instanceId || `final-${Date.now()}`;

  const ossDir = getOssDir();
  const outDir = path.join(ossDir, 'production', String(projectId), 'finals');
  ensureDir(outDir);

  const timestamp = Date.now();
  const finalId = `final-${timestamp}`;

  // 收集素材
  const imageList = [];
  if (Array.isArray(shots)) {
    shots.forEach((shot, i) => {
      if (shot && shot.imageUrl) imageList.push({ index: i, shotId: shot.shotId || shot.id || `shot_${i}`, url: shot.imageUrl });
    });
  } else if (shots && shots.images) {
    shots.images.forEach((img, i) => {
      imageList.push({ index: i, shotId: `shot_${i}`, url: typeof img === 'string' ? img : img?.imageUrl });
    });
  }

  const finalManifest = {
    id: finalId,
    instanceId,
    projectId,
    createdAt: timestamp,
    summary: {
      totalShots: Array.isArray(shots) ? shots.length : (shots?.images?.length || 0),
      totalDuration: timeline?.totalDuration || 0,
      imageCount: imageList.length,
    },
    images: imageList,
    timeline: timeline || null,
    plan: plan || null,
  };

  const manifestPath = path.join(outDir, `${finalId}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(finalManifest, null, 2), 'utf-8');

  // 尝试生成一个视频（如果 ffmpeg 可用）
  let videoPath = null;
  try {
    const { execSync } = require('child_process');
    execSync('ffmpeg -version', { stdio: 'ignore' });
    const concatList = path.join(outDir, `${finalId}-inputs.txt`);
    const lines = imageList.map(img => `file '${path.join(ossDir, img.url)}'`).join('\n');
    fs.writeFileSync(concatList, lines, 'utf-8');
    videoPath = path.join(outDir, `${finalId}.mp4`);
    execSync(`ffmpeg -f concat -safe 0 -i "${concatList}" -vf "format=yuv420p" -c:v libx264 -r 24 "${videoPath}"`, { stdio: 'ignore' });
  } catch (e) {
    // ffmpeg 不存在时跳过真实视频合成
  }

  return {
    finalId,
    manifestPath: manifestPath.replace(ossDir, ''),
    videoPath: videoPath ? videoPath.replace(ossDir, '') : null,
    summary: finalManifest.summary,
  };
};