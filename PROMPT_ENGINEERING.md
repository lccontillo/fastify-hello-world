In my google sheet:

```csv
template_id	style	prompt	status	request_id	images_url	upscale_request_id	upscaled_url	drive_link	Like	revision_reason	Dislike
1	photo_id	A headshot portrait of xecv5xBlabc
2	illustration	A whimsical cartoon illustration of xecv5xBlabc in a fantasy forest
```

For each active selected rows,using appscript create a menu, perform the following:

1. Create a request to generate image

### Generate a new image

POST https://nebius-endpoint.onrender.com/generate
Content-Type: application/json
X-NEBIUS-KEY: //from settings

{
"prompt": {{PROMPT_COLUMN}},
"negative_prompt": null,
"seed": null
}

Response:
{
task_id: xxx
}

put the task_id to request_id column and status equals "IN_QUEUE"

2. For rows that are status is not "COMPLETED"Check status and get result if completed:

### Check task status by ID (replace with your actual task ID)

GET https://nebius-endpoint.onrender.com/tasks/5560762b-774c-4f21-8a4e-130c5582d2cc

Result:
{
"id": "5560762b-774c-4f21-8a4e-130c5582d2cc",
"prompt": "a woman in space",
"negative_prompt": "blurry, low quality",
"seed": 12345,
"status": "completed",
"createdAt": "2025-04-14T22:30:13.168Z",
"completedAt": "2025-04-14T22:30:17.592Z"
}

If status is "completed", set status to "COMPLETED", get the url from result and put to images_url

### Get task result by ID (replace with your actual task ID)

GET https://nebius-endpoint.onrender.com/tasks/5560762b-774c-4f21-8a4e-130c5582d2cc/result
Accept: application/json

Response:
{
"data": [
{
"b64_json": null,
"url": "https://pictures-storage.storage.eu-north1.nebius.cloud/text2img-315eefba-b3fa-44fc-a419-069ab80b9327_00001_.webp"
}
],
"id": "text2img-315eefba-b3fa-44fc-a419-069ab80b9327"
}

### Test Webhook POST

POST http://localhost:3000/webhook
Content-Type: application/json

{
"exampleKey": "exampleValue"
}
