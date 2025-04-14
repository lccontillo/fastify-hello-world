const port = process.env.PORT || 3000;
const host = "RENDER" in process.env ? `0.0.0.0` : `localhost`;
const OpenAI = require("openai");
const { v4: uuidv4 } = require("uuid");

const fastify = require("fastify")({
  logger: true,
});

// Configure rate limiter - 100 requests per minute
const RATE_LIMIT = 100;
const MINUTE_IN_MS = 60 * 1000;

// Task storage
const tasks = new Map();

// Queue for pending tasks
const taskQueue = [];

// Rate limiter state
let requestsThisMinute = 0;
let lastResetTime = Date.now();

// Process the queue periodically
setInterval(async () => {
  // Reset counter if a minute has passed
  const now = Date.now();
  if (now - lastResetTime >= MINUTE_IN_MS) {
    requestsThisMinute = 0;
    lastResetTime = now;
  }

  // Process tasks if we haven't hit the rate limit
  while (requestsThisMinute < RATE_LIMIT && taskQueue.length > 0) {
    const taskId = taskQueue.shift();
    const task = tasks.get(taskId);

    if (task && task.status === "pending") {
      requestsThisMinute++;

      // Update task status
      tasks.set(taskId, { ...task, status: "processing" });

      try {
        // Create OpenAI client with the stored API key
        const client = new OpenAI({
          baseURL: "https://api.studio.nebius.com/v1/",
          apiKey: task.apiKey,
        });

        // Process the task
        const response = await client.images.generate({
          model: "black-forest-labs/flux-dev",
          response_format: "url",
          extra_body: {
            response_extension: "png",
            width: task.width || 1024,
            height: task.height || 1024,
            num_inference_steps: task.num_inference_steps || 28,
            negative_prompt: task.negative_prompt || "",
            seed: task.seed || -1,
          },
          prompt: task.prompt,
        });

        // Update task with result
        tasks.set(taskId, {
          ...task,
          status: "completed",
          result: response,
          completedAt: new Date().toISOString(),
        });
      } catch (error) {
        fastify.log.error(`Task ${taskId} failed: ${error.message}`);
        // Update task with error
        tasks.set(taskId, {
          ...task,
          status: "failed",
          error: error.message,
          completedAt: new Date().toISOString(),
        });
      }
    }
  }
}, 500); // Check queue every 500ms

// Middleware to check for API key
fastify.addHook("preHandler", (request, reply, done) => {
  // Skip API key check for status endpoints
  if (request.url.startsWith("/tasks/") || request.url === "/queue/status") {
    return done();
  }

  const apiKey = request.headers["x-nebius-key"];
  if (!apiKey) {
    return reply.code(401).send({ error: "X-NEBIUS-KEY header is required" });
  }

  // Store the API key in the request for use in route handlers
  request.nebiusKey = apiKey;
  done();
});

// Health check endpoint
fastify.get("/", async (request, reply) => {
  return { status: "ok" };
});

// Route to submit a new image generation task
fastify.post("/generate", async (request, reply) => {
  const { prompt, negative_prompt, seed, width, height, num_inference_steps } =
    request.body;

  if (!prompt) {
    return reply.code(400).send({ error: "Prompt is required" });
  }

  // Create a new task
  const taskId = uuidv4();
  const task = {
    id: taskId,
    prompt,
    width,
    height,
    num_inference_steps,
    negative_prompt: negative_prompt || "",
    seed: seed || -1,
    apiKey: request.nebiusKey, // Store the API key with the task
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  // Store the task
  tasks.set(taskId, task);

  // Add to queue
  taskQueue.push(taskId);

  fastify.log.info(
    `Task ${taskId} added to queue, current queue length: ${taskQueue.length}`
  );
  return reply.code(202).send({ task_id: taskId });
});

// Route to check task status
fastify.get("/tasks/:taskId", async (request, reply) => {
  const { taskId } = request.params;

  if (!tasks.has(taskId)) {
    return reply.code(404).send({ error: "Task not found" });
  }

  const task = tasks.get(taskId);

  // Don't send the API key or full image data in the response
  const { apiKey, result, ...taskInfo } = task;

  return reply.send(taskInfo);
});

// Route to get task result
fastify.get("/tasks/:taskId/result", async (request, reply) => {
  const { taskId } = request.params;

  if (!tasks.has(taskId)) {
    return reply.code(404).send({ error: "Task not found" });
  }

  const task = tasks.get(taskId);

  if (task.status !== "completed") {
    return reply.send({
      status: task.status,
      message:
        task.status === "failed" ? task.error : "Task is still processing",
    });
  }

  return reply.send(task.result);
});

// Get queue status
fastify.get("/queue/status", async (request, reply) => {
  return reply.send({
    queueLength: taskQueue.length,
    requestsThisMinute,
    remainingCapacity: RATE_LIMIT - requestsThisMinute,
    tasksInProgress: Array.from(tasks.values()).filter(
      (t) => t.status === "processing"
    ).length,
  });
});

// Start the server
fastify.listen({ host: host, port: port }, function (err, address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`Server is running on ${address}`);
});
