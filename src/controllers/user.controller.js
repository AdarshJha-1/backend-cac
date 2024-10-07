import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

const registerUser = asyncHandler(async (req, res) => {
  const { username, email, fullName, password } = req.body;
  if (
    [fullName, email, username, password].some((field) => field?.trim === "")
  ) {
    throw new ApiError(400, "all fields are required");
  }

  const alreadyExists = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (alreadyExists) {
    throw new ApiError(409, "user with email/username already exists");
  }

  const avatarLocalPath = req.files?.avatar[0]?.path;

  let coverImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  if (!avatarLocalPath) {
    throw new ApiError(400, "avatar file is required");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "avatar file is required");
  }

  const user = await User.create({
    fullName,
    username: username.toLowerCase(),
    email,
    password,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "error creating user");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, createdUser, "user created successfully"));
});

const generateAccessAndRefreshTokens = async (userID) => {
  try {
    const user = await User.findById(userID);
    const refreshToken = user.generateRefreshToken();
    const accessToken = user.generateAccessToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(500, "error while generating tokens");
  }
};

const loginUser = asyncHandler(async (req, res) => {
  const { email, username, password } = req.body;
  if (!username && !email) {
    throw new ApiError(400, "username or email is required");
  }

  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!user) {
    throw new ApiError(404, "user not found");
  }

  const isPasswordCorrect = await user.isPasswordCorrect(password);
  if (!isPasswordCorrect) {
    throw new ApiError(401, "invalid credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "user logged in successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      },
    },
    {
      new: true,
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken")
    .clearCookie("refreshToken")
    .json(new ApiResponse(200, {}, "user logged out"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const refreshTokenIncoming =
    req.cookies.refreshToken || req.body.refreshToken;
 try {
   if (!refreshTokenIncoming) {
     throw new ApiError(401, "unauthorized request");
   }
 
   const decodedToken = jwt.verify(
     refreshTokenIncoming,
     process.env.REFRESH_TOKEN_SECRET
   );
   const user = await User.findById(decodedToken?._id);
   if (!user) {
     throw new ApiError(401, "invalid refresh token");
   }
   if (refreshTokenIncoming !== user?.refreshToken) {
     throw new ApiError(401, "refresh token is expired or used");
   }
 
   const options = {
     httpOnly: true,
     secure: true,
   };
   const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
     user._id
   );
 
   return res
     .status(200)
     .cookie("accessToken", accessToken)
     .cookie("refreshToken", refreshToken)
     .json(
       new ApiResponse(
         200,
         { accessToken, refreshToken },
         "access token refreshed"
       )
     );
 } catch (error) {
  throw new ApiError(401, error.message || "invalid refresh token");
 }
});
export { registerUser, loginUser, logoutUser, refreshAccessToken };
