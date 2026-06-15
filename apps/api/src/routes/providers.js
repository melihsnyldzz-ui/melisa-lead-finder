import { Router } from 'express';
import { listProviderStatuses } from '../providers/index.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(listProviderStatuses());
});

export default router;
