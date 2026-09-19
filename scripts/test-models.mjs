import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("Sem API_KEY");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

const candidateModels = [
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite"
];

async function testModels() {
  console.log("Testando modelos candidatos para ver qual funciona no Tier Gratuito (novo usuário)...\n");
  
  for (const modelName of candidateModels) {
    try {
      console.log(`Testando: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent("Diga 'OK' se você funciona.");
      const text = result.response.text();
      console.log(`[SUCESSO] O modelo ${modelName} retornou: ${text}`);
      // Break early if we find a good one? No, let's see all that work.
    } catch (e) {
      console.log(`[ERRO] O modelo ${modelName} falhou: ${e.message.split('\n')[0]}`);
    }
  }
}

testModels();
