import axios from "axios";

const SHIFTN_API_KEY =
  "4dH3ox5PmTRWB0jDktUXuNGvghOSJwsIaL7EZ9pVQyzeFMKnbfY81clC2q6Ari";
const SHIFTN_URL = "https://straight-image-service.beleef.com.au/correct";

const WEBHOOK_URL =
  process.env.NODE_ENV === "production"
    ? "https://imagen-backend-586886091897.australia-southeast1.run.app/api/images/shiftn-callbackURL"
    : "http://localhost:5174/api/images/shiftn-callbackURL";

export const sendToShiftn = async (
  imageUrl: string,
  jobId: string,
): Promise<void> => {
  const response = await axios.post(
    SHIFTN_URL,
    {
      imageUrl,
      option: "A2",
      requestId: jobId,
      webhookUrl: WEBHOOK_URL,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": SHIFTN_API_KEY,
      },
      timeout: 60000,
    },
  );

  console.log("📐 SHIFT-N response:", JSON.stringify(response.data, null, 2));
};
