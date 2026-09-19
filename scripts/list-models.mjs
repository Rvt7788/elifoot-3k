import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("No API Key");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

async function listModels() {
  try {
    // Acessando o endpoint de listagem via fetch nativo, já que o SDK às vezes oculta isso
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
    const data = await response.json();
    console.log("Modelos disponíveis:");
    data.models.forEach(m => {
      console.log(`- ${m.name} (${m.displayName})`);
    });
  } catch (e) {
    console.error(e);
  }
}

listModels();
