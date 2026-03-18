// import {
//   GoogleGenAI,
//   Modality,
//   GenerateContentResponse,
//   Content,
// } from "@google/genai";
// import { buildFinalPrompt } from "./prompt.service";

// const MODEL = "gemini-3.1-flash-image-preview";

// const ai = new GoogleGenAI({
//   vertexai: true,
//   project: process.env.GCLOUD_PROJECT_ID!,
//   location: process.env.GCLOUD_LOCATION || "us-central1",
//   apiVersion: "v1",
//   httpOptions: {
//     baseUrl: "https://aiplatform.googleapis.com",
//     timeout: 600000,
//   },
// });

// export const editImageWithVertex = async (
//   imageBuffer: Buffer,
//   mimeType: string,
//   prompt: string,
//   isCustomPrompt: boolean = false,
// ): Promise<{ editedImage: string; finalPrompt: string }> => {
//   const finalPrompt = await buildFinalPrompt(prompt, isCustomPrompt);
//   console.log("🎯 Final prompt:", finalPrompt);

//   const userContent: Content = {
//     role: "user",
//     parts: [
//       {
//         inlineData: {
//           mimeType,
//           data: imageBuffer.toString("base64"),
//         },
//       },
//       { text: finalPrompt },
//     ],
//   };

//   const result = await ai.models.generateContent({
//     model: MODEL,
//     contents: [userContent],
//     config: {
//       responseModalities: [Modality.TEXT, Modality.IMAGE],
//       temperature: 1,
//       topP: 0.95,
//       maxOutputTokens: 32768,
//     },
//   });
//   const response: GenerateContentResponse = result;
//   let editedImage: string | null = null;

//   const candidate = response.candidates?.[0];

//   if (candidate?.content?.parts) {
//     const imagePart = candidate.content.parts.find(
//       (part: any) => !!part.inlineData,
//     );

//     if (imagePart?.inlineData?.data) {
//       editedImage = imagePart.inlineData.data;
//     }
//   }

//   if (!editedImage) {
//     if (response.promptFeedback?.blockReason) {
//       throw new Error(
//         `Blocked by Safety: ${response.promptFeedback.blockReason}`,
//       );
//     }
//     throw new Error("No image returned from Gemini.");
//   }

//   return { editedImage, finalPrompt };
// };

import {
  GoogleGenAI,
  Modality,
  GenerateContentResponse,
  Content,
} from "@google/genai";

import { buildFinalPrompt } from "./prompt.service";

// const MODEL = "gemini-3.1-flash-image-preview";
const MODEL = "gemini-3.1-flash-image";

const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GCLOUD_PROJECT_ID!,
  location: process.env.GCLOUD_LOCATION || "us-central1",
  apiVersion: "v1",
  httpOptions: {
    baseUrl: "https://aiplatform.googleapis.com",
    timeout: 600000,
  },
});

export const editImageWithVertex = async (
  imageBuffer: Buffer,
  mimeType: string,
  prompt: string,
  isCustomPrompt: boolean = false,
): Promise<{ editedImage: string; finalPrompt: string }> => {
  // const finalPrompt = await buildFinalPrompt(prompt, isCustomPrompt);
  const finalPrompt = buildFinalPrompt(prompt);
  console.log("🎯 Final prompt:", finalPrompt);

  const userContent: Content = {
    role: "user",
    parts: [
      {
        inlineData: {
          mimeType,
          data: imageBuffer.toString("base64"),
        },
      },
      { text: finalPrompt },
    ],
  };

  const result = await ai.models.generateContent({
    model: MODEL,
    contents: [userContent],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
      temperature: 1,
      topP: 0.95,
      maxOutputTokens: 32768,
    },
  });

  const response: GenerateContentResponse = result;

  console.log("📡 Full Vertex Response:", JSON.stringify(response, null, 2));

  let editedImage: string | null = null;
  const candidate = response.candidates?.[0];

  if (candidate?.content?.parts) {
    const textPart = candidate.content.parts.find((part: any) => !!part.text);
    if (textPart) {
      console.log("📝 Model Text Response:", textPart.text);
    }

    const imagePart = candidate.content.parts.find(
      (part: any) => !!part.inlineData,
    );

    if (imagePart?.inlineData?.data) {
      editedImage = imagePart.inlineData.data;
    }
  }

  if (!editedImage) {
    console.error("❌ Failed to get image. Candidate:", candidate);

    if (response.promptFeedback?.blockReason) {
      console.error("🚫 Block Reason:", response.promptFeedback.blockReason);
      throw new Error(
        `Blocked by Safety: ${response.promptFeedback.blockReason}`,
      );
    }
    throw new Error("No image returned from Gemini.");
  }

  return { editedImage, finalPrompt };
};
