import { GoogleGenAI, Type } from "@google/genai";

let genAI: GoogleGenAI | null = null;

function getGenAI() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing. Please associate your API key with a project in the Secrets tab to activate AI features.");
    }
    genAI = new GoogleGenAI({ apiKey });
  }
  return genAI;
}

export interface DiagnosisResult {
  cropName: string;
  condition: string;
  severity: 'Low' | 'Medium' | 'High';
  explanation: string;
  actionPlan: string[];
}

export interface QuestionResult {
  answer: string;
  actionPlan: string[];
}

export interface RecommendationResult {
  recommendedCrops: string[];
  confidenceScores: number[];
  reasons: string;
  modelMetrics: {
    accuracy: number;
    precision: number;
  };
}

export async function diagnoseCrop(base64Image: string, language: string = "English"): Promise<DiagnosisResult> {
  const modelName = "gemini-3-flash-preview";
  const ai = getGenAI();
  
  const systemInstruction = `You are an expert agronomist for rural farmers. 
Your goal is to diagnose crop health from images and provide simple, actionable advice.
Use simple language that a farmer can easily understand.
IMPORTANT: You MUST provide the response in ${language}.
Always provide exactly 3 clear action steps in the action plan.
Return the result in JSON format.`;

  const prompt = "Diagnose the crop in this image. If it's healthy, say so. If there's a problem, identify it and provide a 1-2-3 action plan.";

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image.split(',')[1] || base64Image,
            },
          },
          { text: prompt },
        ],
      },
    ],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          cropName: { type: Type.STRING, description: "The name of the crop identified." },
          condition: { type: Type.STRING, description: "The health condition or disease identified." },
          severity: { type: Type.STRING, enum: ["Low", "Medium", "High"], description: "The severity of the issue." },
          explanation: { type: Type.STRING, description: "A simple explanation of what is happening." },
          actionPlan: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "Exactly 3 clear action steps for the farmer."
          },
        },
        required: ["cropName", "condition", "severity", "explanation", "actionPlan"],
      },
    },
  });

  try {
    return JSON.parse(response.text || "{}") as DiagnosisResult;
  } catch (error) {
    console.error("Failed to parse Gemini response:", error);
    throw new Error("Could not understand the diagnosis. Please try again.");
  }
}

export async function askQuestion(question: string, language: string = "English", base64Image?: string): Promise<QuestionResult> {
  const modelName = "gemini-3-flash-preview";
  const ai = getGenAI();
  
  const systemInstruction = `You are an expert agronomist for rural farmers. 
Your goal is to answer questions about farming, crops, and pests.
IMPORTANT: You MUST provide the response in ${language}.
Use simple language. Provide a clear answer and a 1-2-3 action plan if applicable.
Return the result in JSON format.`;

  const parts: any[] = [{ text: question }];
  if (base64Image) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: base64Image.split(',')[1] || base64Image,
      },
    });
  }

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [{ parts }],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          answer: { type: Type.STRING, description: "The direct answer to the farmer's question." },
          actionPlan: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "Exactly 3 clear action steps."
          },
        },
        required: ["answer", "actionPlan"],
      },
    },
  });

  try {
    return JSON.parse(response.text || "{}") as QuestionResult;
  } catch (error) {
    console.error("Failed to parse Gemini response:", error);
    throw new Error("Could not understand the answer. Please try again.");
  }
}

export async function recommendCrop(params: {
  soilType: string;
  nitrogen: string;
  phosphorus: string;
  potassium: string;
  moisture: string;
  rainfall: string;
  temp: string;
}, language: string = "English"): Promise<RecommendationResult> {
  const modelName = "gemini-3-flash-preview";
  const ai = getGenAI();
  
  const systemInstruction = `You are a precision ML model for agriculture.
Your goal is to recommend the best crops based on soil and environmental data.
Data includes: Nitrogen, Phosphorus, Potassium (NPK), Soil Moisture, Rainfall, and Temperature.
IMPORTANT: You MUST provide the response in ${language}.
Also include simulated model metrics (Accuracy and Precision) to represent the ML model quality.
Return exactly 3 crop recommendations with confidence scores.
Return the result in JSON format.`;

  const prompt = `Recommend crops for these parameters:
- Nitrogen: ${params.nitrogen}
- Phosphorus: ${params.phosphorus}
- Potassium: ${params.potassium}
- Soil: ${params.soilType}
- Moisture: ${params.moisture}
- Rainfall: ${params.rainfall}
- Temp: ${params.temp}°C
Provide the recommendation as if you are a trained classification model.`;

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          recommendedCrops: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "Top 3 crop recommendations."
          },
          confidenceScores: { 
            type: Type.ARRAY, 
            items: { type: Type.NUMBER },
            description: "Confidence scores (0-1) for each recommendation."
          },
          reasons: { type: Type.STRING, description: "Scientific reasoning for these recommendations." },
          modelMetrics: {
            type: Type.OBJECT,
            properties: {
              accuracy: { type: Type.NUMBER },
              precision: { type: Type.NUMBER },
            }
          }
        },
        required: ["recommendedCrops", "confidenceScores", "reasons", "modelMetrics"],
      },
    },
  });

  try {
    return JSON.parse(response.text || "{}") as RecommendationResult;
  } catch (error) {
    console.error("Failed to parse Gemini response:", error);
    throw new Error("Could not generate recommendations. Please try again.");
  }
}
