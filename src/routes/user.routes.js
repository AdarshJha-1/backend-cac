import express from "express";
import { upload } from "../middlewares/multer.js";
import { registerUser } from "../controllers/user.controller.js";
// import { loginUser } from "../controllers/user.controller.js";

const router = express.Router();

router.route("/register").post(
  upload.fields([
    {
      name: "avatar",
      maxCount: 1,
    },
    {
      name: "coverImage",
      maxCount: 1,
    },
  ]),
  registerUser
);
// router.route("/login").post(loginUser)

export default router;
