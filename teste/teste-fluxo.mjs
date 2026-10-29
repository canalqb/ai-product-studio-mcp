import { spawnSync } from 'child_process';

// Test 1: START CHAT
const startChat = spawnSync('node', ['teste/chamar.mjs', 'start_chat'], {
  encoding: 'utf8',
  shell: false,
  stdio: ['pipe', 'pipe', 'pipe']
});
console.log('=== 1. START CHAT ===');
const startOutput = startChat.stdout.toString();
const jsonStart = startOutput.split('\n').find(l => l.trim().startsWith('{'));
console.log('etapa:', JSON.parse(jsonStart).etapa_atual);
console.log('grupo:', JSON.parse(jsonStart).grupo_atual);
console.log('perguntas:', JSON.parse(jsonStart).perguntas_do_grupo.length);

// Test 2: ANSWER PLATAFORMS
const answerP = spawnSync('node', ['teste/chamar.mjs', 'answer_question', JSON.stringify({ pergunta_id: 'plataformas', resposta: 'TikTok' })], {
  encoding: 'utf8',
  shell: false,
  stdio: ['pipe', 'pipe', 'pipe']
});
console.log('=== 2. RESPONDER PLATAFORMS ===');
const answerOutput = answerP.stdout.toString();
const jsonAnswer = answerOutput.split('\n').find(l => l.trim().startsWith('{'));
console.log('resposta:', JSON.parse(jsonAnswer).resposta_salva.resposta);

// Test 3: GET NEXT QUESTIONS
const getQuestion = spawnSync('node', ['teste/chamar.mjs', 'get_question'], {
  encoding: 'utf8',
  shell: false,
  stdio: ['pipe', 'pipe', 'pipe']
});
console.log('=== 3. GET NEXT QUESTIONS ===');
const getOutput = getQuestion.stdout.toString();
const jsonGet = getOutput.split('\n').find(l => l.trim().startsWith('{'));
console.log('grupo:', JSON.parse(jsonGet).grupo_atual);
console.log('perguntas:', JSON.parse(jsonGet).perguntas.length);
