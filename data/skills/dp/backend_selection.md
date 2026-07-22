---
id: dp_backend_selection
name: DP backend selection
category: utility
version: 1.0
parameters: [{"name":"shotType","type":"string","required":true,"description":"Shot type"},{"name":"saturation","type":"string","required":false,"description":"Style saturation"}]
---

Select the generation backend deterministically: use ComfyUI for close-ups, reference-heavy shots, and desaturated custom styles; use the API for standard shots when no custom workflow is required.
