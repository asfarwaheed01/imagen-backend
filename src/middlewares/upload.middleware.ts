// import multer from "multer";

// const storage = multer.memoryStorage();

// export const upload = multer({
//   storage,
//   limits: { fileSize: 20 * 1024 * 1024 },
//   fileFilter: (req, file, cb) => {
//     const allowed = ["image/jpeg", "image/png", "image/webp"];
//     if (allowed.includes(file.mimetype)) {
//       cb(null, true);
//     } else {
//       cb(new Error("Only JPEG, PNG, and WEBP images are allowed"));
//     }
//   },
// });

import multer from "multer";

const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/x-adobe-dng",
  "image/x-sony-arw",
  "image/x-nikon-nef",
  "image/x-canon-cr2",
  "image/x-canon-cr3",
  "image/x-fuji-raf",
  "image/x-panasonic-rw2",
  "image/x-olympus-orf",
  "image/x-pentax-pef",
  "application/octet-stream",
];

export const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split(".").pop()?.toLowerCase();
    const allowedExts = [
      "jpg",
      "jpeg",
      "png",
      "webp",
      "heic",
      "dng",
      "arw",
      "nef",
      "cr2",
      "cr3",
      "raf",
      "rw2",
      "orf",
      "pef",
    ];
    if (
      ALLOWED_MIME_TYPES.includes(file.mimetype) ||
      allowedExts.includes(ext ?? "")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type"));
    }
  },
});
