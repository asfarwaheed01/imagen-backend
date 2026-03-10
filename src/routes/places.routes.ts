import { Router, Request, Response } from "express";

const router = Router();
const API_KEY = process.env.GOOGLE_PLACES_API_KEY!;

// GET /api/places/autocomplete?input=...
router.get("/autocomplete", async (req: Request, res: Response) => {
  const input = req.query.input as string;
  if (!input) return res.status(400).json({ message: "input required" });

  try {
    const response = await fetch(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": API_KEY,
        },
        body: JSON.stringify({
          input,
          includedRegionCodes: ["au"],
          locationRestriction: {
            rectangle: {
              low: { latitude: -37.505, longitude: 140.999 },
              high: { latitude: -28.157, longitude: 153.639 },
            },
          },
        }),
      },
    );

    const data = await response.json();

    const suggestions = (data.suggestions ?? []).map((s: any) => {
      const p = s.placePrediction;
      return {
        placeId: p.placeId,
        description: p.text?.text ?? "",
        mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
        secondaryText: p.structuredFormat?.secondaryText?.text ?? "",
      };
    });

    res.json({ suggestions });
  } catch (err) {
    console.error("Places autocomplete error:", err);
    res.status(500).json({ message: "Places API error" });
  }
});

router.get("/details", async (req: Request, res: Response) => {
  const placeId = req.query.placeId as string;
  if (!placeId) return res.status(400).json({ message: "placeId required" });

  try {
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        headers: {
          "X-Goog-Api-Key": API_KEY,
          "X-Goog-FieldMask": "addressComponents",
        },
      },
    );

    const data = await response.json();

    const components: any[] = data.addressComponents ?? [];
    const stateComponent = components.find((c) =>
      c.types?.includes("administrative_area_level_1"),
    );
    const state = stateComponent?.shortText ?? null;

    res.json({ state });
  } catch (err) {
    console.error("Places details error:", err);
    res.status(500).json({ message: "Places API error" });
  }
});

export default router;
