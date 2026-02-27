import { GoogleAuth } from "google-auth-library";
import axios from "axios";
import { buildFinalPrompt } from "./prompt.service";

const PROJECT_ID = process.env.GCLOUD_PROJECT_ID!;
const LOCATION = "us-central1";
const MODEL = "gemini-2.5-flash-image";

const VERTEX_URL = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

export const editImageWithVertex = async (
  imageBuffer: Buffer,
  mimeType: string,
  prompt: string,
  isCustomPrompt: boolean = false,
): Promise<{ editedImage: string; finalPrompt: string }> => {
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  const finalPrompt = await buildFinalPrompt(prompt, isCustomPrompt);
  console.log("🎯 Final prompt:", finalPrompt);

  const response = await axios.post(
    VERTEX_URL,
    {
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: imageBuffer.toString("base64") } },
            { text: finalPrompt },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
        temperature: 1,
      },
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken.token}`,
      },
    },
  );

  const parts = response.data?.candidates?.[0]?.content?.parts;
  const imagePart = parts?.find((p: any) => p.inlineData?.data);

  if (!imagePart) {
    throw new Error("No image returned from Vertex AI");
  }

  return {
    editedImage: imagePart.inlineData.data,
    finalPrompt,
  };
};
