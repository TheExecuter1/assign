import express from "express";

import userRoutes from "./user.routes";
import purchaseRoutes from "./purchase.routes";
import watchRoutes from "./watch.routes";

const router = express.Router();
router.use('/user', userRoutes);
router.use('/purchase', purchaseRoutes);
router.use('/watch', watchRoutes);


export default router;