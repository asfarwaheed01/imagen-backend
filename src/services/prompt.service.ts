import { GoogleAuth } from "google-auth-library";
import axios from "axios";

const PROJECT_ID = process.env.GCLOUD_PROJECT_ID!;
const LOCATION = "us-central1";

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

const REAL_ESTATE_SYSTEM_WRAPPER = `
You are a professional real estate photo editor. Apply the following editing request to the image.

PROFESSIONAL GUIDELINES (ALWAYS APPLY):
- Be hyper-specific in your edits — preserve every architectural detail exactly
- Maintain the original camera angle, perspective, and composition
- Use photographic language: natural lighting, wide-angle shot, realistic textures
- Enhance only what is requested — leave everything else completely untouched
- Ensure the result looks like a professional real estate marketing photograph
- No artistic stylization, no watermarks, no text overlays
- Output must be photorealistic, not illustrated or rendered

STRUCTURAL RULES (NON-NEGOTIABLE):
- Preserve all windows, doors, walls, ceilings, floors exactly as they are
- Do NOT add pools, decks, extensions, or any new structures
- Do NOT change room layout or building footprint
- Do NOT modify camera angle or perspective

USER REQUEST:
`;

export const enhancePrompt = async (userPrompt: string): Promise<string> => {
  console.log("✨ Enhancing prompt with Gemini 2.5 Flash via Vertex...");

  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  const VERTEX_URL = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-2.5-flash:generateContent`;

  const response = await axios.post(
    VERTEX_URL,
    {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are a professional real estate photo editing prompt engineer.

A user has written this image editing instruction:
"${userPrompt}"

Your job is to rewrite and enhance this into a highly detailed, professional prompt for an AI image editor.

RULES:
- Keep the user's original intent exactly — do NOT change what they want
- Add hyper-specific details, professional photography language
- Use step-by-step structure for complex edits
- Use semantic positive descriptions instead of negatives (e.g. "clear blue sky" not "no clouds")
- Add cinematic/photographic terms where relevant (e.g. "soft natural lighting", "wide-angle perspective")
- Keep it focused on real estate photography best practices
- Return ONLY the enhanced prompt, no explanations or preamble`,
            },
          ],
        },
      ],
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken.token}`,
      },
    },
  );

  const enhancedPrompt =
    response.data?.candidates?.[0]?.content?.parts?.[0]?.text || userPrompt;

  console.log("Enhanced prompt:", enhancedPrompt);
  return enhancedPrompt;
};

export const buildFinalPrompt = async (
  userPrompt: string,
  isCustomPrompt: boolean,
): Promise<string> => {
  let finalUserPrompt = userPrompt;

  if (isCustomPrompt) {
    finalUserPrompt = await enhancePrompt(userPrompt);
  }

  return `${REAL_ESTATE_SYSTEM_WRAPPER}${finalUserPrompt}`;
};
