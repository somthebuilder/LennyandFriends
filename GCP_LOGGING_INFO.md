# GCP API Logging Information

## Why logs might not appear in GCP

The `google.genai` SDK uses the **Generative AI REST API** (`generativelanguage.googleapis.com`), which:
- Uses API keys (not service accounts)
- May not automatically log to GCP Cloud Logging
- Logs appear in the **Generative AI Studio** dashboard, not Cloud Logging

## Where to check logs

1. **Generative AI Studio Dashboard:**
   - Go to: https://makersuite.google.com/app/apikey
   - Check API usage and quotas
   - View request history (if available)

2. **GCP Cloud Logging (if using Vertex AI):**
   - Only shows logs if using Vertex AI API (not REST API)
   - Requires service account authentication
   - Logs appear under: `vertexai.googleapis.com`

## Current setup

- **API Type:** Generative AI REST API (via `google.genai` SDK)
- **Authentication:** API Key (from `.env`)
- **Logging:** Added console logging in code to track API calls

## To see logs in GCP Cloud Logging

You would need to:
1. Switch to Vertex AI API (requires GCP project setup)
2. Use service account authentication
3. Enable Vertex AI API in your GCP project

## Current logging

The build script now logs:
- Each API call with chunk ID and model
- Response time and approximate token count
- Errors if they occur

Check `build.log` for these logs.

