import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { ZodError } from 'zod';
import aiRouter from './routes/ai.js';
import instagramRouter from './routes/instagram.js';
import leadsRouter from './routes/leads.js';
import providersRouter from './routes/providers.js';
import searchTasksRouter from './routes/searchTasks.js';

const app = express();
const port = process.env.API_PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'melisa-lead-finder-api' });
});

app.use('/api/leads', leadsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/instagram', instagramRouter);
app.use('/api/providers', providersRouter);
app.use('/api/search-tasks', searchTasksRouter);

app.use((err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation error',
      details: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Unexpected error' });
});

app.listen(port, () => {
  console.log(`Melisa Lead Finder API running on http://localhost:${port}/api`);
});
