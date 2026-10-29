#!/usr/bin/env node
// AI Product Studio MCP — fluxo interativo para comerciais de produto com IA
// Imagens: NanoBanana 2.1 | Vídeo: Google Flow, apenas "Frames para vídeo"
// Marca d'água obrigatória: "canalqb videos"
// Transportes: stdio (local) e Streamable HTTP /mcp (remoto — Render, PORT env)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const IMG_DIR = path.join(DATA_DIR, "imagens");
const ENTREGA_DIR = path.join(DATA_DIR, "entrega");
const SESSAO_PATH = path.join(DATA_DIR, "sessao.json");
for (const d of [DATA_DIR, IMG_DIR, ENTREGA_DIR]) fs.mkdirSync(d, { recursive: true });

const WATERMARK_TEXT = "canalqb videos";
const FFMPEG_9_16_CMD = String.raw`ffmpeg -i entrada.mp4 -vf "drawtext=text='canalqb videos':fontcolor=white@0.6:fontsize=h*0.032:shadowcolor=black@0.4:shadowx=2:shadowy=2:x=w*0.05:y=h*0.16" -c:a copy saida_marcada.mp4`;
const FFMPEG_16_9_CMD = String.raw`ffmpeg -i entrada.mp4 -vf "drawtext=text='canalqb videos':fontcolor=white@0.6:fontsize=h*0.04:shadowcolor=black@0.4:shadowx=2:shadowy=2:x=w*0.04:y=h-th-h*0.04" -c:a copy saida_marcada.mp4`;

const MCP_EXTERNOS = [
  { funcao: "Detectar o objeto central (bounding box)", mcp: "groundlight/mcp-vision", url: "https://github.com/groundlight/mcp-vision", fallback: "Análise visual do agente + confirmação do usuário" },
  { funcao: "Visão local sem nuvem", mcp: "Whoawhen/FusionVisionMCP", url: "https://github.com/Whoawhen/FusionVisionMCP", fallback: "Idem" },
  { funcao: "Recorte/redimensionamento de imagem", mcp: "sunriseapps/imagesorcery-mcp", url: "https://github.com/sunriseapps/imagesorcery-mcp", fallback: "O prompt NanoBanana 2.1 faz o recorte" },
  { funcao: "Operações OpenCV", mcp: "GongRzhe/opencv-mcp-server", url: "https://github.com/GongRzhe/opencv-mcp-server", fallback: "Idem" },
  { funcao: "Descrição de imagem via IA", mcp: "tan-yong-sheng/ai-vision-mcp", url: "https://github.com/tan-yong-sheng/ai-vision-mcp", fallback: "Idem" },
  { funcao: "OCR (marca na embalagem)", mcp: "sandraschi/ocr-mcp", url: "https://github.com/sandraschi/ocr-mcp", fallback: "Perguntar ao usuário o nome da marca" },
  { funcao: "OCR alternativo", mcp: "rjn32s/mcp-ocr", url: "https://github.com/rjn32s/mcp-ocr", fallback: "Idem" },
  { funcao: "Screenshot de UI (app/site)", mcp: "drisplabs/browser-mcp", url: "https://github.com/drisplabs/browser-mcp", fallback: "Usuário envia prints" },
];

const ORCAMENTO_FALA = { 4: [8, 10], 6: [12, 15], 8: [16, 20] };

const PROGRESSAO_EN = {
  4: "0-1s: hook with movement, product visible and a short opening line; 1-2s: the product is brought toward the camera; 2-4s: one visible benefit is shown in a single simple, direct action, closing with the CTA. Only ONE action; everything must be physically plausible.",
  6: "0-1.5s: hook; 1.5-4.5s: hands-on demonstration with direct interaction with the product; 4.5-6s: closing CTA with the product clearly held toward the camera.",
  8: "0-1.5s: hook; 1.5-3.5s: hands-on demonstration with direct product interaction; 3.5-6s: close-up detail or benefit; 6-8s: CTA with the product highlighted in a clear final position.",
};

const COMP_9_16 = "Vertical 9:16 framing. Keep the product and the key action inside the central third of the frame, avoiding the top ~15%, the bottom ~20-25% and the right ~15% of the frame (platform interface safe zones). Adjust camera distance so the product and the character remain fully visible.";
const COMP_16_9 = "Horizontal 16:9 framing with a 5% safe margin on all edges. Compose product and character with balanced negative space; do not simply crop a vertical shot.";

function marcaDaguaEn(proporcao) {
  const pos = proporcao === "9:16"
    ? "placed on the left side, about 16% below the top"
    : "placed in the lower-left corner with a 4% margin";
  return 'A small, subtle, semi-transparent white watermark text reading exactly "canalqb videos" in lowercase, clean sans-serif font, static, ' + pos + ", visible for the entire duration, never covering the product or the face. No other on-screen text.";
}

const PERGUNTAS = {
  etapa0_briefing: [
    {
      grupo: "1", titulo: "Briefing de publicação — grupo 1/2",
      perguntas: [
        { id: "plataformas", pergunta: "A. Onde o anúncio vai rodar? (pode marcar várias)", opcoes: ["Instagram Reels", "Instagram/Facebook Stories", "TikTok", "YouTube Shorts", "Kwai", "YouTube horizontal / página de produto", "Todas"] },
        { id: "objetivo", pergunta: "B. Objetivo do anúncio?", opcoes: ["Venda direta (link/loja)", "Reconhecimento de marca", "Lançamento", "Promoção/oferta", "Recomendo por você"] },
        { id: "formato_anuncio", pergunta: "C. Formato de anúncio (gancho narrativo)?", opcoes: ["Problema → solução", "Demonstração de uso", "Achadinho/descoberta", "Unboxing", "Antes e depois (só se verdadeiro e demonstrável)", "Comparativo visual", "Review espontâneo (UGC)", "Recomendo por você"] },
        { id: "oferta_cta", pergunta: "D. Há preço, desconto, frete grátis ou prazo? Qual a chamada final (CTA)? Ex.: 'link na bio'. Se não souber, o CTA será genérico e sem número inventado.", opcoes: ["(resposta livre)", "Sem oferta específica — CTA genérico"] },
      ],
    },
    {
      grupo: "2", titulo: "Briefing de publicação — grupo 2/2",
      perguntas: [
        { id: "tom", pergunta: "E. Tom da comunicação?", opcoes: ["Animado/energético", "Natural/espontâneo", "Premium/sofisticado", "Divertido/humor leve", "Informativo"] },
        { id: "audio", pergunta: "F. Áudio: fala do personagem + som ambiente (padrão). Música de fundo?", opcoes: ["Sem música (padrão — para colocar áudio em alta na plataforma)", "Clima musical sutil"] },
      ],
    },
  ],
  etapa1_imagem: [
    {
      grupo: "1", titulo: "Imagem do produto",
      perguntas: [
        { id: "imagem", pergunta: "Envie a imagem que deseja transformar em produto (caminho local ou URL).", opcoes: [] },
        { id: "elemento_principal", pergunta: "Se houver vários elementos com importância semelhante, qual deve ser o PRODUTO principal?", opcoes: ["Elemento central/maior", "A definir ao enviar a imagem"] },
      ],
    },
  ],
  etapa1_5_funcoes: [
    {
      grupo: "1", titulo: "Funções cinematográficas",
      perguntas: [
        { id: "funcoes", pergunta: "Quais funções cinematográficas deseja usar? (pode escolher várias, nenhuma, ou recomendação automática)", opcoes: [
          "/droneview — perspectiva aérea com movimento de drone sobre a cena",
          "/closeup no olho [direito/esquerdo] — zoom dinâmico no olhar (só com pessoa visível)",
          "/fullbody da pessoa [ação/cenário] — corpo inteiro em movimento contextualizado",
          "/centerfocus no [objeto] e embace os demais — foco seletivo profissional (bokeh)",
          "/orbit — rotação 360° fluida ao redor do sujeito/objeto",
          "Nenhuma",
          "Recomendo por você",
        ] },
      ],
    },
  ],
  etapa2_personagem: [
    {
      grupo: "tipo", titulo: "Tipo de vídeo",
      perguntas: [
        { id: "tipo_video", pergunta: "Qual será o formato do vídeo? (não misturar sem definir a transição)", opcoes: ["POV — perspectiva em primeira pessoa", "UGC — conteúdo espontâneo produzido por uma pessoa", "Quero ajuda para escolher (dica: UGC converte bem em achadinhos, review e unboxing; POV funciona bem em produtos de uso corporal, ferramentas e utilidades)"] },
      ],
    },
    {
      grupo: "pov", titulo: "POV — configuração",
      perguntas: [
        { id: "parte_do_corpo", pergunta: "Qual parte do corpo deve aparecer ou servir de perspectiva?", opcoes: ["Pés", "Mãos", "Cintura", "Pescoço", "Costas", "Bumbum", "Ombros", "Todas as partes (quando compatível)", "Outra parte do corpo"] },
        { id: "genero_aparente", pergunta: "Gênero aparente da pessoa representada?", opcoes: ["Masculino", "Feminino", "Neutro/andrógino", "Personalizado"] },
      ],
    },
    {
      grupo: "ugc_1", titulo: "UGC — aparência geral e pele (1/4)",
      perguntas: [
        { id: "sexo_aparente", pergunta: "A. Sexo ou apresentação do personagem?", opcoes: ["Masculino", "Feminino", "Andrógino", "Personalizado"] },
        { id: "faixa_etaria", pergunta: "Faixa etária aparente? (menores de idade: não gerar; para publicidade prefira adulto)", opcoes: ["Jovem adulto", "Adulto", "Meia-idade", "Idoso"] },
        { id: "aparencia_da_pele", pergunta: "B. Aparência da pele (descritivo)?", opcoes: ["Muito clara", "Clara", "Intermediária", "Morena", "Castanha/escura", "Personalizada"] },
        { id: "identidade_cultural_escolhida", pergunta: "Ascendência/identidade cultural? (só se for escolha explícita de direção criativa)", opcoes: ["Não especificar", "(resposta livre)"] },
      ],
    },
    {
      grupo: "ugc_2", titulo: "UGC — cabelos (2/4)",
      perguntas: [
        { id: "cor_do_cabelo", pergunta: "Cor do cabelo?", opcoes: ["Preto", "Castanho-escuro", "Castanho", "Loiro", "Ruivo", "Grisalho", "Branco", "Colorido", "Personalizado"] },
        { id: "comprimento_do_cabelo", pergunta: "Comprimento do cabelo?", opcoes: ["Careca/raspado", "Muito curto", "Curto", "Médio", "Longo", "Muito longo"] },
        { id: "textura_do_cabelo", pergunta: "Textura?", opcoes: ["Liso", "Ondulado", "Cacheado", "Crespo", "Trançado", "Coque", "Rabo de cavalo", "Outro estilo"] },
        { id: "estilo_do_cabelo", pergunta: "Estilo/arranjo? (opcional)", opcoes: ["(livre)", "Soltos", "Preso", "Estilizado"] },
      ],
    },
    {
      grupo: "ugc_3", titulo: "UGC — olhos, pelos e biotipo (3/4)",
      perguntas: [
        { id: "cor_dos_olhos", pergunta: "Cor dos olhos?", opcoes: ["Castanhos", "Pretos/castanho muito escuro", "Azuis", "Verdes", "Mel/âmbar", "Cinzentos", "Heterocromia", "Personalizado"] },
        { id: "bigode", pergunta: "Bigode?", opcoes: ["Sem bigode", "Discreto", "Cheio", "Estilizado"] },
        { id: "barba", pergunta: "Barba/costeletas? (quando relevante)", opcoes: ["Sem barba", "Barba curta", "Barba cheia", "Costeletas"] },
        { id: "biotipo", pergunta: "Biotipo corporal?", opcoes: ["Muito magro", "Magro", "Esbelto", "Atlético", "Definido/musculoso", "Médio", "Encorpado", "Robusto", "Plus size", "Personalizado"] },
      ],
    },
    {
      grupo: "ugc_4", titulo: "UGC — altura, estilo e energia (4/4)",
      perguntas: [
        { id: "altura_aparente", pergunta: "Altura aparente?", opcoes: ["Baixa", "Média", "Alta"] },
        { id: "roupas_e_estilo", pergunta: "Estilo de roupa e vibe? (casual, esportiva, profissional, sofisticada...)", opcoes: ["(resposta livre)", "Casual natural"] },
        { id: "expressao_personalidade", pergunta: "Expressão facial predominante e energia diante da câmera?", opcoes: ["Sorriso leve e energia acolhedora", "Confiança tranquila", "Entusiasmo animado", "(resposta livre)"] },
        { id: "sotaque", pergunta: "Sotaque regional brasileiro? (opcional)", opcoes: ["Neutro", "Paulistano", "Carioca", "Nordestino", "Mineiro", "Sulino", "Outro"] },
      ],
    },
  ],
  etapa3_cenario: [
    {
      grupo: "1", titulo: "Cenário — categoria e local",
      perguntas: [
        { id: "categoria", pergunta: "Onde o vídeo será apresentado?", opcoes: [
          "Ambiente comercial (loja, shopping, supermercado, vitrine, showroom, academia, salão, restaurante, oficina, mercado)",
          "Ambiente público (rua, praça, parque, calçada, estação, feira)",
          "Dentro de casa (perguntar o cômodo)",
          "Natureza (praia, mata, rio, cachoeira, lago, campo, montanha, trilha, deserto)",
          "Profissional/corporativo", "Estúdio", "Personalizado", "Recomende por mim",
        ] },
        { id: "local", pergunta: "Local específico? (ex.: 'cozinha americana', 'praia ao amanhecer', 'loja de bairro')", opcoes: ["(resposta livre)"] },
      ],
    },
    {
      grupo: "2", titulo: "Cenário — detalhes",
      perguntas: [
        { id: "comodo", pergunta: "Se for dentro de casa: qual cômodo?", opcoes: ["Sala", "Cozinha", "Quarto", "Banheiro", "Escritório", "Varanda", "Jardim", "Garagem", "Lavanderia", "Área gourmet", "Outro"] },
        { id: "periodo", pergunta: "Dia ou noite?", opcoes: ["Dia", "Noite"] },
        { id: "clima_iluminacao", pergunta: "Clima/condições e iluminação? (ex.: 'sol suave da manhã entrando pela janela')", opcoes: ["(resposta livre)", "Luz natural difusa"] },
        { id: "pessoas_movimento", pergunta: "Pessoas ao fundo e nível de movimentação?", opcoes: ["Sem pessoas ao fundo", "Poucas pessoas, movimento leve", "Ambiente movimentado"] },
      ],
    },
    {
      grupo: "3", titulo: "Cenário — atmosfera e restrições",
      perguntas: [
        { id: "estilo_visual", pergunta: "Estilo visual?", opcoes: ["Realista natural (UGC)", "Clean comercial", "Cinematográfico suave"] },
        { id: "atmosfera", pergunta: "Atmosfera desejada?", opcoes: ["Acolhedora", "Energética", "Premium", "Divertida", "Informativa"] },
        { id: "elementos_secundarios", pergunta: "Objetos secundários no ambiente?", opcoes: ["(resposta livre)", "Mínimos — foco no produto"] },
        { id: "restricoes", pergunta: "Restrições de cenário?", opcoes: ["Nenhuma", "(resposta livre)"] },
      ],
    },
  ],
  etapa4_dialogo: [
    {
      grupo: "1", titulo: "Fala do vendedor",
      perguntas: [
        { id: "fala_pt_br", pergunta: "Fala do vendedor em português brasileiro (curta, natural, com gancho + benefício + CTA). Será validada contra a duração. Ou peça 'Recomendo por você'.", opcoes: ["Recomendo por você"] },
        { id: "duracao_alvo", pergunta: "Duração-alvo para validar a fala? (a matriz gera 4, 6 e 8 s; validar em 4 s garante que caiba em todas)", opcoes: ["4", "6", "8"] },
      ],
    },
  ],
};

// ---------- estado ----------
function estadoInicial() {
  return {
    etapa_atual: "etapa0_briefing",
    briefing: null,
    produto: null,
    personagem: null,
    cenario: null,
    dialogo: null,
    video: null,
    imagens: [],
  };
}
function carregar() {
  try {
    const s = JSON.parse(fs.readFileSync(SESSAO_PATH, "utf8"));
    return { ...estadoInicial(), ...s };
  } catch {
    return estadoInicial();
  }
}
function salvar(s) {
  const tmp = SESSAO_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2), "utf8");
  fs.renameSync(tmp, SESSAO_PATH);
}

// ---------- utils ----------
const ok = (x) => ({ content: [{ type: "text", text: typeof x === "string" ? x : JSON.stringify(x, null, 2) }] });
const fail = (msg) => ({ isError: true, content: [{ type: "text", text: String(msg) }] });

function temBin(exe) {
  try {
    const r = spawnSync(`${exe} -version`, { shell: true, encoding: "utf8", timeout: 15000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

function dimensoes(buf) {
  if (!buf || buf.length < 12) return { width: null, height: null, formato: "desconhecido" };
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), formato: "png" };
  if (buf.toString("ascii", 0, 3) === "GIF") return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), formato: "gif" };
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const fourcc = buf.toString("ascii", 12, 16);
    if (fourcc === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, formato: "webp" };
    if (fourcc === "VP8L") { const b = buf.readUInt32LE(21); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1, formato: "webp" }; }
    if (fourcc === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3), formato: "webp" };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), formato: "jpeg" };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return { width: null, height: null, formato: "desconhecido" };
}

async function baixarImagem(src) {
  const ehUrl = /^https?:\/\//i.test(src);
  if (ehUrl) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Falha ao baixar a imagem (HTTP ${res.status}).`);
    const buf = Buffer.from(await res.arrayBuffer());
    const dim = dimensoes(buf);
    const ext = { png: "png", gif: "gif", webp: "webp", jpeg: "jpg" }[dim.formato] || "jpg";
    const arquivo = path.join(IMG_DIR, `original_${Date.now()}.${ext}`);
    fs.writeFileSync(arquivo, buf);
    return { arquivo, origem: "url", content_type: res.headers.get("content-type") || "" };
  }
  const arquivo = path.resolve(src);
  if (!fs.existsSync(arquivo)) throw new Error(`Arquivo não encontrado: ${arquivo}`);
  const buf = fs.readFileSync(arquivo);
  const copia = path.join(IMG_DIR, `original_${Date.now()}${path.extname(arquivo) || ".img"}`);
  fs.writeFileSync(copia, buf);
  return { arquivo: copia, origem: "arquivo_local", content_type: "" };
}

function ocrSePossivel(arquivo) {
  if (!temBin("tesseract")) {
    return { disponivel: false, texto: "", aviso: "Tesseract não instalado — pergunte ao usuário o nome/marca visível na embalagem; nunca invente marca." };
  }
  try {
    const r = spawnSync(`tesseract "${arquivo}" stdout -l por+eng`, { shell: true, encoding: "utf8", timeout: 60000 });
    if (r.status === 0) return { disponivel: true, texto: (r.stdout || "").trim(), aviso: "" };
    return { disponivel: true, texto: "", aviso: "OCR executou mas não retornou texto (imagem pode não conter texto legível)." };
  } catch (e) {
    return { disponivel: false, texto: "", aviso: String(e) };
  }
}

function resolverTexto(valor) {
  if (typeof valor !== "string") return valor;
  if (valor.startsWith("@")) return fs.readFileSync(valor.slice(1).trim(), "utf8");
  return valor;
}

const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

function promptsQuatroVistas(nomeProduto, descricao) {
  const nome = nomeProduto || "the product";
  const desc = descricao || "[PRODUCT DESCRIPTION — preencha com a análise visual]";
  const base = `Using NanoBanana 2.1, reconstruct the following product with total visual fidelity, without beautifying or altering its identity: ${nome} — ${desc}.`;
  const config = "Vertical 9:16 composition, product perfectly centered horizontally and vertically, fully visible with no cropping, uniform margins with safe area around it, pure white uniform background (transparent background if supported), professional studio lighting, soft controlled shadows, high definition, sharp details, realistic perspective, catalog-grade commercial appearance. Do not add text, logos, watermarks, prices or decorative elements. Only infer what is visible or safely inferable from the reference; do not invent hidden parts, buttons or features.";
  return {
    frontal: `${base} Frontal/main view. ${config}`,
    tres_quartos: `${base} Three-quarter perspective view of the same product. ${config}`,
    lateral: `${base} Side view of the same product. ${config}`,
    traseira_ou_complementar: `${base} Back view (or the most relevant complementary angle) of the same product. ${config}`,
  };
}

function recomendarFuncoes(categoria = "", tipoVideo = "", cenarioCategoria = "") {
  const t = (tipoVideo || "").toUpperCase();
  const cat = (categoria || "").toLowerCase();
  const cen = (cenarioCategoria || "").toLowerCase();
  const recs = [];
  recs.push({ funcao: "/centerfocus no [produto] e embace os demais", beneficio: "Foco seletivo profissional com bokeh — destaca o produto; recomendado para qualquer categoria.", compativel: true });
  if (t === "UGC") {
    recs.push({ funcao: "/fullbody da pessoa [ação/cenário]", beneficio: "Corpo inteiro em ação contextualizada — reforça a naturalidade do UGC.", compativel: true });
    recs.push({ funcao: "/closeup no olho [direito/esquerdo]", beneficio: "Opcional: zoom no olhar gera conexão; use só se a emoção fizer parte do gancho.", compativel: "opcional" });
  }
  if (["natureza", "publico", "público", "comercial"].includes(cen)) {
    recs.push({ funcao: "/droneview", beneficio: "Perspectiva aérea valoriza cenários amplos e externos.", compativel: true });
  }
  const vestivel = /roupa|camisa|vestido|calca|calça|tenis|tênis|sapato|relogio|relógio|oculos|óculos|acessor|joia|joía|bijuteria|bolsa|mochila|bone|boné/.test(cat);
  recs.push({
    funcao: "/orbit",
    beneficio: vestivel
      ? "Rotação 360° — use com cautela em produtos vestíveis em uso; prefira com o produto apoiado em superfície."
      : "Rotação 360° fluida em torno do produto — ótima para mostrar o acabamento por todos os lados (não invente o que não é visível ao girar).",
    compativel: vestivel ? "use_com_cautela" : true,
  });
  return recs;
}

function zonasLivres(plataformas) {
  const p = (plataformas || []).join(" ").toLowerCase();
  const horizontal = /horizontal|página/.test(p);
  return {
    "9_16": "avoid top 15%, bottom 20-25% and right 15% for key action",
    "16_9": "5% safe margin",
  };
}

// ---------- descrições EN para prompts de vídeo ----------
const naoInformado = (v) => !v || v === "nao_informado" || v === "desconhecido";

function resumoProdutoEn(produto) {
  const p = (produto && produto.produto) || {};
  const nome = p.nome_comercial_sugerido || "the product";
  const partes = [`${nome} (${p.categoria || "category not informed"}) — ${p.descricao || "no description provided"}`];
  if ((p.cores || []).filter(Boolean).length) partes.push(`Colors: ${p.cores.filter(Boolean).join(", ")}.`);
  if ((p.materiais_observaveis || []).filter(Boolean).length) partes.push(`Materials: ${p.materiais_observaveis.filter(Boolean).join(", ")}.`);
  if ((p.caracteristicas_visiveis || []).filter(Boolean).length) partes.push(`Visible features: ${p.caracteristicas_visiveis.filter(Boolean).join(", ")}.`);
  partes.push("Do not invent logos, buttons or features that are not visible; preserve exact identity, proportions and details of the product.");
  return partes.join(" ");
}

function resumoPersonagemEn(personagem) {
  const ch = personagem || {};
  if ((ch.tipo_video || "").toUpperCase() === "POV") {
    const pov = ch.pov || {};
    const partes = (pov.parte_do_corpo || []).length ? pov.parte_do_corpo.join(", ") : "body parts as configured";
    return `CHARACTER (POV): first-person point of view; visible body parts: ${partes}; apparent gender: ${pov.genero_aparente || "not specified"}; face not shown unless the framing clearly requires it.`;
  }
  const p = ch.personagem || {};
  const seg = [];
  const add = (label, v) => { if (v && !naoInformado(v)) seg.push(`${label}: ${Array.isArray(v) ? v.join(", ") : v}`); };
  add("apparent sex", p.sexo_aparente);
  add("apparent age range", p.faixa_etaria || p.idade_aparente);
  add("skin appearance", p.aparencia_da_pele);
  add("eye color", p.cor_dos_olhos);
  const cabelo = [p.cor_do_cabelo, p.comprimento_do_cabelo, p.textura_do_cabelo, p.estilo_do_cabelo].filter((x) => x && !naoInformado(x)).join(" ");
  if (cabelo) add("hair", cabelo);
  const pelos = [p.bigode, p.barba].filter((x) => x && !naoInformado(x)).join(", ");
  if (pelos) add("facial hair", pelos);
  add("body build", p.biotipo);
  add("apparent height", p.altura_aparente);
  add("wearing", p.roupas);
  add("accessories", p.acessorios);
  add("expression", p.expressao);
  add("personality", p.personalidade);
  if (p.sotaque && !naoInformado(p.sotaque)) seg.push(`Brazilian Portuguese speech with ${p.sotaque} accent`);
  return `CHARACTER (UGC): ${seg.join("; ") || "natural everyday person"}. Speaking natural Brazilian Portuguese.`;
}

function resumoCenarioEn(cenario) {
  const c = cenario || {};
  const seg = [];
  const add = (label, v) => { if (v && v !== "nao_informado") seg.push(`${label}: ${Array.isArray(v) ? v.join(", ") : v}`); };
  seg.push(`${c.categoria || "cenario não informado"}${c.local ? " — " + c.local : ""}${c.comodo ? " (" + c.comodo + ")" : ""}`);
  add("period", c.periodo);
  add("weather", c.clima);
  add("lighting", c.iluminacao);
  add("visual style", c.estilo_visual);
  add("atmosphere", c.atmosfera);
  add("secondary elements", c.elementos_secundarios);
  add("ambient movement", c.movimento_ambiental);
  return `SCENE: ${seg.join("; ")}. The scenario complements the product and never competes with it.`;
}

function cameraEn(funcoes, tipoVideo) {
  const base = (tipoVideo || "").toUpperCase() === "POV"
    ? "first-person POV camera with natural handheld movement"
    : "natural handheld UGC-style camera with subtle organic movement";
  const mapa = {
    "/droneview": "aerial drone-style movement over the scene",
    "/closeup": "dynamic close-up zoom into the character's eyes",
    "/fullbody": "wide full-body framing showing the character in contextual action",
    "/centerfocus": "selective focus on the product with professional bokeh on everything else",
    "/orbit": "smooth 360-degree orbit around the product",
  };
  const extras = (funcoes || []).map((f) => {
    const key = Object.keys(mapa).find((k) => String(f).startsWith(k) || String(f).startsWith(k.split(" ")[0]));
    return key ? mapa[key] : null;
  }).filter(Boolean);
  return [base, ...extras].join("; ") + ".";
}

function framesEn(tipoVideo, nomeProduto, cenario) {
  const local = (cenario && (cenario.local || cenario.categoria)) || "the scene";
  const nome = nomeProduto || "the product";
  if ((tipoVideo || "").toUpperCase() === "POV") {
    return {
      inicial: `POV: the character interacts with the ${nome} for the first time in ${local}, starting the hook line, hands entering the frame naturally.`,
      final: `POV: the character's hands hold the ${nome} clearly presented toward the camera, finishing the call to action.`,
    };
  }
  return {
    inicial: `The character stands in ${local}, the ${nome} within reach or already in hand, looking at the camera and starting the hook line with natural movement.`,
    final: `The character holds the ${nome} up toward the camera in a clear presentational position, confident expression, finishing the call to action.`,
  };
}

function promptVideoEn(ctx, modo, proporcao, duracao) {
  const L = [];
  L.push(`PRODUCT: ${ctx.produtoEn}`);
  L.push(ctx.personagemEn);
  L.push(`SCENE: ${ctx.cenarioEn}`);
  if (modo === "primeiro_e_ultimo") {
    L.push(`FIRST FRAME: ${ctx.frameInicial}`);
    L.push(`LAST FRAME: ${ctx.frameFinal}`);
  }
  L.push(`ACTION (total ${duracao} seconds): ${PROGRESSAO_EN[duracao]}`);
  L.push(`CAMERA: ${ctx.cameraEn}`);
  L.push(`COMPOSITION: ${proporcao === "9:16" ? COMP_9_16 : COMP_16_9}`);
  L.push(`LIGHTING & STYLE: ${ctx.luzEn}`);
  L.push("CONSISTENCY: Preserve the exact product identity, colors, materials, proportions and visible details. Preserve the character identity across all frames. Only physically plausible actions; no product transformation, no invented features, no exaggerated gestures. No on-screen text, captions, logos or prices.");
  L.push(`WATERMARK: ${marcaDaguaEn(proporcao)}`);
  L.push(`AUDIO: Spoken dialogue in Brazilian Portuguese: "${ctx.fala}" — natural, spontaneous voice; soft realistic ambient sound; no background music.`);
  if (modo === "primeiro_e_ultimo") L.push("TRANSITION: Smooth, continuous and physically plausible motion between the first frame and the last frame, preserving identity, scene and relative positions of people and objects.");
  L.push(`MODE: Google Flow "Frames to video: ${modo === "primeiro" ? "First" : "First and Last"}". Never use video reference elements or external video references.`);
  return L.join("\n");
}

function montarJsonVideo(sessao) {
  const produto = sessao.produto || {};
  const personagem = sessao.personagem || {};
  const cenario = sessao.cenario || {};
  const dialogo = sessao.dialogo || {};
  const briefing = sessao.briefing || {};
  const p = produto.produto || {};
  const nome = p.nome_comercial_sugerido || "o produto";
  const tipoVideo = personagem.tipo_video || "UGC";
  const funcoes = produto.funcoes_cinematograficas_escolhidas || [];
  const frames = framesEn(tipoVideo, p.nome_comercial_sugerido, cenario);
  const ctx = {
    produtoEn: resumoProdutoEn(produto),
    personagemEn: resumoPersonagemEn(personagem),
    cenarioEn: resumoCenarioEn(cenario),
    cameraEn: cameraEn(funcoes, tipoVideo),
    luzEn: `natural, coherent lighting matching the scenario (${cenario.iluminacao || "natural ambient light"}); realistic commercial look, no stylized filters`,
    fala: dialogo.fala_pt_br || "",
    frameInicial: frames.inicial,
    frameFinal: frames.final,
  };
  const configuracoes = [];
  for (const modo of ["primeiro", "primeiro_e_ultimo"]) {
    for (const proporcao of ["9:16", "16:9"]) {
      for (const dur of [4, 6, 8]) {
        const cfg = { modo_frames: modo, proporcao, duracao_segundos: dur, prompt_video_en: promptVideoEn(ctx, modo, proporcao, dur) };
        if (modo === "primeiro_e_ultimo") { cfg.frame_inicial = frames.inicial; cfg.frame_final = frames.final; }
        configuracoes.push(cfg);
      }
    }
  }
  return {
    etapa: "criacao_video",
    modelo_imagem: "NanoBanana 2.1",
    ferramenta_video: "Google Flow",
    conceito_unico: {
      nome: `${(briefing.formato_anuncio || "demonstração").toLowerCase()} — ${nome}`,
      objetivo: briefing.objetivo || "venda direta",
      mensagem_principal: p.argumento_de_venda || "",
      estilo: briefing.tom || "natural",
      tipo_video: tipoVideo,
      produto: nome,
      personagem: tipoVideo === "POV" ? `POV (${(personagem.pov && personagem.pov.parte_do_corpo || []).join(", ")})` : `${(personagem.personagem && personagem.personagem.sexo_aparente) || "personagem"} UGC`,
      cenario: `${cenario.categoria || ""}${cenario.local ? " — " + cenario.local : ""}`,
      plataformas_alvo: briefing.plataformas || [],
    },
    direcao_audiovisual: {
      idioma_instrucoes: "en",
      idioma_dialogo: "pt-BR",
      gancho_primeiro_segundo: "movimento + produto visível + fala curta no primeiro segundo",
      interacao_com_produto: p.demonstracoes_sugeridas || [],
      movimentos_camera: funcoes,
      enquadramentos: tipoVideo === "POV" ? ["POV primeira pessoa", "close nas mãos e no produto"] : ["plano médio UGC", "close no produto"],
      zonas_livres_plataforma: zonasLivres(briefing.plataformas),
      iluminacao: cenario.iluminacao || "natural",
      continuidade: ["identidade do produto constante", "identidade do personagem constante", "cenário e luz coerentes entre frames"],
      restricoes: [
        "never use video reference elements",
        "never use external video references",
        "preserve product identity",
        "preserve character identity",
        "no on-screen text other than the watermark",
      ],
    },
    marca_dagua: {
      texto: WATERMARK_TEXT,
      posicao_9_16: "left side, about 16% below the top",
      posicao_16_9: "lower-left corner, 4% margin",
      opacidade: 0.6,
      tamanho_relativo_altura: "3-4%",
      estatica: true,
      duracao: "entire_video",
      aplicar_em_pos_producao: true,
    },
    dialogo: {
      personagem: tipoVideo === "POV" ? "narrador POV" : "vendedor(a) UGC",
      fala_pt_br: dialogo.fala_pt_br || "",
      fala_no_prompt_entre_aspas: true,
      palavras: dialogo.palavras || 0,
      duracao_alvo_validada_segundos: dialogo.duracao_alvo || 4,
      duracao_compativel: true,
    },
    cta: briefing.cta || "chamada genérica (sem número inventado)",
    configuracoes_video: configuracoes,
    pos_producao: {
      comando_ffmpeg_marca_dagua_9_16: FFMPEG_9_16_CMD,
      comando_ffmpeg_marca_dagua_16_9: FFMPEG_16_9_CMD,
      lembrete_rotulo_conteudo_ia: true,
    },
    referencias_video: false,
    elementos_referencia_video: false,
  };
}

// ---------- validação ----------
function validarEstrutura(obj) {
  const erros = [];
  const vazio = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
  const etapa = obj && obj.etapa;
  if (etapa === "produto") {
    if (vazio(obj.produto?.nome_comercial_sugerido)) erros.push("produto.nome_comercial_sugerido ausente/vazio");
    if (vazio(obj.produto?.categoria)) erros.push("produto.categoria ausente/vazio");
    if (vazio(obj.produto?.descricao)) erros.push("produto.descricao ausente/vazio");
    if (obj.imagem?.proporcao !== "9:16") erros.push("imagem.proporcao deve ser '9:16'");
  } else if (etapa === "personagem") {
    if (!["POV", "UGC"].includes(obj.tipo_video)) erros.push("tipo_video deve ser 'POV' ou 'UGC'");
    if (obj.tipo_video === "POV" && vazio(obj.pov?.parte_do_corpo)) erros.push("pov.parte_do_corpo ausente/vazio");
    if (!obj.consistencia) erros.push("bloco 'consistencia' ausente");
  } else if (etapa === "cenario") {
    if (vazio(obj.categoria)) erros.push("categoria ausente/vazia");
    if (obj.continuidade_espacial !== true) erros.push("continuidade_espacial deve ser true");
  } else if (etapa === "criacao_video") {
    if (vazio(obj.conceito_unico?.nome)) erros.push("conceito_unico.nome ausente/vazio");
    if (vazio(obj.dialogo?.fala_pt_br)) erros.push("dialogo.fala_pt_br ausente/vazio");
    if (obj.dialogo?.fala_no_prompt_entre_aspas !== true) erros.push("dialogo.fala_no_prompt_entre_aspas deve ser true");
    const n = (obj.configuracoes_video || []).length;
    if (n !== 12) erros.push(`configuracoes_video deve ter 12 entradas (recebi ${n})`);
    if (obj.referencias_video !== false) erros.push("referencias_video deve ser false");
    if (obj.marca_dagua?.texto !== WATERMARK_TEXT) erros.push(`marca_dagua.texto deve ser exatamente '${WATERMARK_TEXT}'`);
    (obj.configuracoes_video || []).forEach((c, i) => {
      if (!String(c.prompt_video_en || "").includes('Spoken dialogue in Brazilian Portuguese: "')) erros.push(`config ${i + 1}: fala entre aspas duplas ausente no prompt`);
      if (!String(c.prompt_video_en || "").includes(WATERMARK_TEXT)) erros.push(`config ${i + 1}: marca d'água ausente no prompt`);
      if (c.modo_frames === "primeiro_e_ultimo" && (vazio(c.frame_inicial) || vazio(c.frame_final))) erros.push(`config ${i + 1}: frame_inicial/frame_final ausentes`);
    });
  } else {
    erros.push(`Campo 'etapa' desconhecido ou ausente: '${etapa}' (esperado: produto | personagem | cenario | criacao_video)`);
  }
  return erros;
}

function lintPrompt(prompt) {
  const alertas = [];
  const semNegacao = String(prompt)
    .replace(/never use (?:any )?(?:external )?video references?/gi, "")
    .replace(/never use video reference elements/gi, "")
    .replace(/nunca usar elementos?\/?refer[êe]ncias? para v[íi]deo/gi, "");
  const usoVideoRef = /(use|using|add|include|with)\s+(?:a\s+|the\s+)?video\s+reference|ingredients\s+to\s+video|elementos?\s+de\s+refer[êe]ncia\s+para\s+v[íi]deo|v[íi]deo\s+de\s+refer[êe]ncia/i;
  if (usoVideoRef.test(semNegacao)) alertas.push({ tipo: "erro", mensagem: "Prompt parece USAR referência/elemento de vídeo — regra absoluta do fluxo: apenas 'Frames para vídeo'." });
  if (!prompt.includes(WATERMARK_TEXT)) alertas.push({ tipo: "aviso", mensagem: `Marca d'água '${WATERMARK_TEXT}' não encontrada no prompt.` });
  if (!/Spoken dialogue in Brazilian Portuguese:\s*["“]/.test(prompt)) alertas.push({ tipo: "aviso", mensagem: 'Fala em pt-BR entre aspas duplas no formato \'Spoken dialogue in Brazilian Portuguese: "..."\' não encontrada.' });
  if (/\b(price|pre[çc]o|discount|% off)\b/i.test(prompt)) alertas.push({ tipo: "aviso", mensagem: "Menção a preço/desconto — não mostrar preço na tela sem autorização." });
  return { ok: alertas.length === 0, bloqueado: alertas.some((a) => a.tipo === "erro"), total_alertas: alertas.length, alertas };
}

function proximaAcao(etapa) {
  switch (etapa) {
    case "etapa0_briefing": return "Preencha o briefing (start_briefing) ou peça as perguntas (next_question).";
    case "etapa1_imagem": return "Envie a imagem do produto (analyze_product_image).";
    case "etapa1_5_funcoes": return "Escolha as funções cinematográficas (recommend_cinematic_functions + set_cinematic_functions).";
    case "etapa2_personagem": return "Defina o tipo de vídeo e o personagem (build_character_sheet).";
    case "etapa3_cenario": return "Defina o cenário (build_scene_json).";
    case "etapa4_dialogo": return "Escreva e valide a fala do vendedor (write_dialogue).";
    case "etapa5_geracao": return "Gere a matriz de 12 configurações (build_video_matrix).";
    case "etapa5_concluido": return "Fluxo concluído. Entrega em data/entrega/ (json_imagem.json, json_personagem.json, json_cenario.json, json_video.json, prompts_video.txt).";
    default: return "Etapa desconhecida.";
  }
}

// ---------- servidor ----------
function criarServidor() {
  const server = new McpServer({ name: "ai-product-studio-mcp", version: "1.0.0" });

  server.tool("start_chat", "Inicia o fluxo em modo chat interativo (perguntas e respostas). Retorna as primeiras perguntas da Etapa 0 (Briefing) e o passo atual.", {}, async () => {
    const estado = carregar();
    estado.etapa_atual = "etapa0_briefing";
    salvar(estado);
    const perguntas = PERGUNTAS.etapa0_briefing;
    const grupo = perguntas[0];
    return ok(JSON.stringify({
      etapa_atual: estado.etapa_atual,
      grupo_atual: grupo.grupo,
      titulo: grupo.titulo,
      perguntas_do_grupo: grupo.perguntas.map((p) => ({ id: p.id, pergunta: p.pergunta, opcoes: p.opcoes, repetir: p.repetir })),
      proximo_passo: "Responda as perguntas acima. Use answer_question com o id da pergunta e a resposta.",
      anotacao: "A Etapa 0 (Briefing) deve ser respondida antes de enviar a imagem. O agente não deve avançar com decisões pendentes.",
    }, null, 2));
  });

  server.tool("get_question", "Retorna a próxima pergunta do fluxo, agrupada (máx. 4 por vez), com o id da pergunta e opções. Para chat interativo.", {
    etapa: z.string().optional().describe("Etapa (default: etapa_atual da sessão)"),
    grupo: z.string().optional().describe("Grupo específico (ex.: 1, 2, tipo, pov, ugc_1)"),
    repetir: z.boolean().optional().describe("Permitir repetir a mesma pergunta se o usuário não souber (máx. 3x)"),
  }, async (args) => {
    const estado = carregar();
    const etapa = args.etapa || estado.etapa_atual;
    const grupos = PERGUNTAS[etapa];
    if (!grupos || !grupos.length) {
      return fail(`Etapa '${etapa}' sem perguntas mapeadas. Etapas disponíveis: ${Object.keys(PERGUNTAS).join(", ")}.`);
    }
    const grupo = args.grupo ? grupos.find((x) => String(x.grupo) === String(args.grupo)) : grupos[0];
    if (!grupo) return fail(`Grupo '${args.grupo || 'default'}' não encontrado na etapa '${etapa}'. Grupos: ${grupos.map((g) => g.grupo).join(", ")}.`);
    const perguntas = [];
    let repetido = false;
    for (const p of grupo.perguntas) {
      const repetidoAtual = estado.pendentes === p.id ? (estado.repeticoes && estado.repeticoes[p.id] || 0) : 0;
      if (repetidoAtual > 0 && args.repetir !== true) {
        repetido = true;
        estado.pendentes = undefined;
        continue;
      }
      perguntas.push({ id: p.id, pergunta: p.pergunta, opcoes: p.opcoes, repetir: p.repetir });
      if (perguntas.length >= 4) break;
    }
    if (perguntas.length === 0) {
      if (repetido) {
        estado.pendentes = undefined;
        salvar(estado);
        return ok(JSON.stringify({ etapa_atual: estado.etapa_atual, perguntas: [], aviso: "Repetição máxima atingida. Responda ou use 'recomendo por você' se disponível.", continuar: true }, null, 2));
      }
    }
    if (perguntas.length === 0 && !grupo.perguntas.length) {
      return fail(`Grupo '${grupo.grupo}' não tem perguntas.`);
    }
    estado.etapa_atual = etapa;
    if (!estado.pendentes) estado.pendentes = perguntas[0]?.id;
    if (!estado.repeticoes) estado.repeticoes = {};
    salvar(estado);
    return ok(JSON.stringify({ etapa_atual: estado.etapa_atual, grupo_atual: grupo.grupo, titulo: grupo.titulo, perguntas: perguntas, sinopse: "Responda com answer_question. Use id = pergunta.id.", repetir: repetido }, null, 2));
  });

  server.tool("answer_question", "Responde uma pergunta do fluxo chat. O MCP salva a resposta e retorna a próxima pergunta.", {
    pergunta_id: z.string().describe("Id da pergunta (ex.: plataformas, objetivo, tipo_video)"),
    resposta: z.string().describe("Resposta do usuário (use 'recomendo por você' para recomendações automáticas)"),
  }, async (args) => {
    const estado = carregar();
    const etapa = estado.etapa_atual;
    const perguntas = PERGUNTAS[etapa];
    if (!perguntas) return fail(`Etapa '${etapa}' não encontrada.`);
    const grupo = perguntas.find((g) => g.perguntas.some((p) => p.id === args.pergunta_id));
    if (!grupo) return fail(`Pergunta '${args.pergunta_id}' não encontrada nesta etapa. Perguntas disponíveis: ${perguntas.map((g) => g.perguntas.map((p) => p.id)).flat().join(", ")}.`);
    const pergunta = grupo.perguntas.find((p) => p.id === args.pergunta_id);
    if (!pergunta) return fail(`Pergunta '${args.pergunta_id}' não encontrada.`);
    if (pergunta.opcoes && !pergunta.opcoes.includes(args.resposta) && args.resposta !== "recomendo por você") {
      return fail(`Resposta inválida. Opções: ${pergunta.opcoes.join(", ")}. Use 'recomendo por você' para automação.`);
    }
    if (!estado.respostas) estado.respostas = {};
    estado.respostas[args.pergunta_id] = args.resposta;
    estado.pendentes = undefined;
    if (pergunta.repetir !== false) {
      estado.repeticoes = estado.repeticoes || {};
      estado.repeticoes[args.pergunta_id] = (estado.repeticoes[args.pergunta_id] || 0) + 1;
    }
    salvar(estado);
    let proximo = perguntas;
    for (const g of perguntas) {
      const p = g.perguntas.find((x) => x.id === args.pergunta_id);
      if (!p) continue;
      const idx = g.perguntas.indexOf(p);
      if (idx + 1 < g.perguntas.length) {
        proximo = perguntas;
        for (const ng of perguntas) {
          const np = ng.perguntas.find((x) => x.id === (g.perguntas[idx + 1]?.id));
          if (np) { proximo = [ng, ...perguntas]; break; }
        }
        break;
      }
    }
    const proximoGrupo = perguntas.find((g) => {
      const p = g.perguntas.find((x) => x.id === args.pergunta_id);
      return p && p.id === grupo.perguntas[grupo.perguntas.length - 1].id;
    });
    if (proximoGrupo && grupo.perguntas.indexOf(proximoGrupo.perguntas[grupo.perguntas.length - 1]) === grupo.perguntas.length - 1) {
      const prox = perguntas[perguntas.indexOf(proximoGrupo) + 1];
      if (prox) proximo = perguntas;
    }
    const resp = {
      etapa_atual: estado.etapa_atual,
      resposta_salva: { pergunta_id: args.pergunta_id, resposta: args.resposta },
      proximo_passo: "Use get_question para obter a próxima pergunta.",
      perguntas: estado.pendentes ? [estado.pendentes] : [],
    };
    return ok(JSON.stringify(resp, null, 2));
  });

  server.tool("get_summary", "Retorna um resumo do que o usuário já respondeu e o próximo passo.", {}, async () => {
    const estado = carregar();
    const briefing = estado.briefing || {};
    const fisicos = estado.personagem ? estado.personagem.personagem : {};
    const cenario = estado.cenario || {};
    return ok(JSON.stringify({
      etapa_atual: estado.etapa_atual,
      briefing: {
        plataformas: briefing.plataformas || [],
        objetivo: briefing.objetivo || "não informado",
        formato_anuncio: briefing.formato_anuncio || "não informado",
        oferta: briefing.oferta || "não informado",
        cta: briefing.cta || "genérico",
        tom: briefing.tom || "não informado",
        audio: briefing.audio || "não informado",
      },
      produto: estado.produto ? estado.produto.produto : null,
      personagem: estado.personagem ? estado.personagem.personagem : null,
      cenario: cenario.categoria || cenario.local || null,
      dialogo: estado.dialogo || null,
      pendente: estado.pendentes ? estado.pendentes : (estado.etapa_atual === "etapa5_concluido" ? "concluído" : "nenhum"),
    }, null, 2));
  });

  server.tool("reset_session", "Zera a sessão (apaga as respostas e volta para o início).", {}, async () => {
    salvar(estadoInicial());
    return ok("Sessão zerada. Escolha 'start_chat' para começar novamente.");
  });
  server.tool("check_environment", "Parte 0 — verifica ambiente (ffmpeg, tesseract, transporte), lista MCPs externos recomendados e o estado da sessão.", {}, async () => {
    const estado = carregar();
    const modoHttp = Boolean(process.env.PORT || process.env.RENDER || process.env.MCP_HTTP === "1");
    return ok(JSON.stringify({
      node: process.version,
      ffmpeg_disponivel: temBin("ffmpeg"),
      tesseract_disponivel: temBin("tesseract"),
      transporte_ativo: modoHttp ? `HTTP /mcp${process.env.PORT ? " (porta " + process.env.PORT + ")" : ""}` : "stdio",
      marca_dagua_padrao: WATERMARK_TEXT,
      mensagem_de_abertura_para_o_agente: "Para a melhor qualidade, recomendo ter estes MCPs instalados no seu agente de IA. Posso continuar sem eles, mas a detecção do produto e a marca d'água ficam menos precisas. O agente nunca deve afirmar que usou um MCP que não está disponível.",
      mcps_externos_recomendados: MCP_EXTERNOS,
      sessao: {
        etapa_atual: estado.etapa_atual,
        briefing: !!estado.briefing,
        produto: !!estado.produto,
        personagem: !!estado.personagem,
        cenario: !!estado.cenario,
        dialogo: !!estado.dialogo,
        video: !!estado.video,
        proxima_acao: proximaAcao(estado.etapa_atual),
      },
    }, null, 2));
  });

  server.tool("start_briefing", "Etapa 0 — salva o briefing de publicação (plataformas, objetivo, formato, oferta/CTA, tom, áudio).", {
    plataformas: z.union([z.array(z.string()), z.string()]).transform((v) => (Array.isArray(v) ? v : v.split(",").map((s) => s.trim()).filter(Boolean))).optional().describe("Plataformas (lista ou texto separado por vírgula)"),
    objetivo: z.string().optional(),
    formato_anuncio: z.string().optional(),
    oferta: z.string().optional(),
    cta: z.string().optional(),
    tom: z.string().optional(),
    audio: z.string().optional(),
  }, async (args) => {
    try {
      const estado = carregar();
      const b = estado.briefing || {};
      estado.briefing = {
        plataformas: args.plataformas || b.plataformas || [],
        objetivo: args.objetivo || b.objetivo || "",
        formato_anuncio: args.formato_anuncio || b.formato_anuncio || "",
        oferta: args.oferta || b.oferta || "",
        cta: args.cta || b.cta || "",
        tom: args.tom || b.tom || "",
        audio: args.audio || b.audio || "fala + som ambiente, sem música",
      };
      const faltam = Object.entries(estado.briefing).filter(([k, v]) => k !== "audio" && k !== "oferta" && (!v || (Array.isArray(v) && !v.length))).map(([k]) => k);
      estado.etapa_atual = faltam.length ? "etapa0_briefing" : "etapa1_imagem";
      salvar(estado);
      const resp = { briefing: estado.briefing, campos_faltantes: faltam, proximo_passo: faltam.length ? "Responda os campos faltantes (veja next_question etapa0_briefing)." : "Etapa 1: envie a imagem do produto com analyze_product_image." };
      return ok(JSON.stringify(resp, null, 2));
    } catch (e) { return fail("Erro no briefing: " + e.message); }
  });

  server.tool("analyze_product_image", "Etapa 1 — baixa a imagem (URL ou caminho), extrai dimensões/formato, roda OCR se disponível e entrega os prompts NanoBanana 2.1 das 4 vistas em 9:16.", {
    imagem: z.string().describe("URL ou caminho local da imagem"),
    nome_produto: z.string().optional().describe("Nome do produto, se já conhecido (opcional)"),
    descricao_produto: z.string().optional().describe("Descrição visual do produto, se já conhecida (opcional)"),
  }, async (args) => {
    try {
      const { arquivo, origem, content_type } = await baixarImagem(args.imagem);
      const buf = fs.readFileSync(arquivo);
      const dim = dimensoes(buf);
      const ocr = ocrSePossivel(arquivo);
      const ratio = dim.width && dim.height ? dim.width / dim.height : null;
      const estado = carregar();
      estado.imagens.push({ arquivo, origem, formato: dim.formato, largura: dim.width, altura: dim.height });
      estado.etapa_atual = "etapa1_imagem";
      salvar(estado);
      const limitacoes = [];
      if (dim.width && dim.width < 500) limitacoes.push("Imagem de baixa resolução (thumbnail) — a reconstrução pode perder detalhes; envie uma imagem maior se possível.");
      if (dim.formato === "desconhecido") limitacoes.push("Formato não identificado pelo parser — a análise depende do agente multimodal.");
      limitacoes.push("Este servidor processa arquivos (download, dimensões, OCR) mas não 'vê' semanticamente a imagem: a identificação do PRODUTO deve ser feita pelo agente multimodal ou confirmada pelo usuário. Não invente marca, logo ou funcionalidade.");
      return ok(JSON.stringify({
        etapa: "etapa1_analise",
        imagem_salva: {
          arquivo_local: arquivo, origem, content_type,
          formato: dim.formato, largura: dim.width, altura: dim.height,
          proporcao_atual: ratio ? ratio.toFixed(3) : null,
          ja_e_9_16: ratio ? Math.abs(ratio - 9 / 16) < 0.03 : null,
        },
        ocr: { disponivel: ocr.disponivel, texto: ocr.texto || "", aviso: ocr.aviso },
        limitacoes: limitacoes,
        prompts_nanobanana_2_1: promptsQuatroVistas(args.nome_produto, args.descricao_produto),
        proximo_passo: "O agente analisa visualmente a imagem (elemento principal = PRODUTO), confirma com o usuário e salva a análise com save_product_json.",
      }, null, 2));
    } catch (e) { return fail("Erro ao analisar a imagem: " + e.message); }
  });

  server.tool("save_product_json", "Etapa 1 — salva a análise visual do produto (feita pelo agente/usuário) e monta o JSON da imagem com prompts das 4 vistas.", {
    produto_json: z.union([z.string(), z.record(z.unknown())]).describe("Campos planos (nome_comercial_sugerido, categoria, descricao, cores, materiais_observaveis, caracteristicas_visiveis, caracteristicas_desconhecidas, beneficios_confirmados, beneficios_a_validar, argumento_de_venda, demonstracoes_sugeridas, marca_lida_na_imagem, observacoes) ou estrutura completa com chave 'produto'."),
  }, async (args) => {
    try {
      let entrada = typeof args.produto_json === "string" ? JSON.parse(args.produto_json) : args.produto_json;
      const pIn = entrada.produto || entrada;
      const produto = {
        nome_comercial_sugerido: pIn.nome_comercial_sugerido || "",
        marca_lida_na_imagem: pIn.marca_lida_na_imagem || "desconhecido",
        categoria: pIn.categoria || "",
        descricao: pIn.descricao || "",
        materiais_observaveis: arr(pIn.materiais_observaveis),
        cores: arr(pIn.cores),
        caracteristicas_visiveis: arr(pIn.caracteristicas_visiveis),
        caracteristicas_desconhecidas: arr(pIn.caracteristicas_desconhecidas),
        beneficios_confirmados: arr(pIn.beneficios_confirmados),
        beneficios_a_validar: arr(pIn.beneficios_a_validar),
        argumento_de_venda: pIn.argumento_de_venda || "",
        demonstracoes_sugeridas: arr(pIn.demonstracoes_sugeridas),
      };
      if (!produto.nome_comercial_sugerido || !produto.categoria || !produto.descricao) {
        return fail("produto_json precisa de pelo menos: nome_comercial_sugerido, categoria e descricao.");
      }
      const estado = carregar();
      const json = {
        etapa: "produto",
        modelo_imagem: "NanoBanana 2.1",
        ...(estado.briefing ? { briefing: estado.briefing } : {}),
        produto,
        imagem: {
          proporcao: "9:16", fundo_preferencial: "transparente", fundo_alternativo: "branco_puro",
          produto_centralizado: true, produto_totalmente_visivel: true, iluminacao: "estudio_profissional",
          vistas: ["frontal", "tres_quartos", "lateral", "traseira_ou_complementar"], quantidade_preferencial: 4,
        },
        consistencia_visual: { preservar_formato: true, preservar_cores: true, preservar_materiais: true, preservar_proporcoes: true, inventar_detalhes: false },
        funcoes_cinematograficas_recomendadas: [],
        funcoes_cinematograficas_escolhidas: [],
        prompts_imagem: promptsQuatroVistas(produto.nome_comercial_sugerido, produto.descricao),
        mcps_utilizados: ["ai-product-studio-mcp (download, dimensões, OCR quando disponível)"],
        observacoes: arr(pIn.observacoes),
      };
      estado.produto = json;
      estado.etapa_atual = "etapa1_5_funcoes";
      salvar(estado);
      fs.writeFileSync(path.join(ENTREGA_DIR, "json_imagem.json"), JSON.stringify(json, null, 2), "utf8");
      fs.writeFileSync(path.join(ENTREGA_DIR, "prompts_imagem.txt"), Object.entries(json.prompts_imagem).map(([k, v]) => `===== VISTA: ${k} =====\n\n${v}`).join("\n\n"), "utf8");
      return ok("PRODUTO salvo (etapa 1 completa). Próximo passo: recommend_cinematic_functions e depois set_cinematic_functions.\n\n" + JSON.stringify(json, null, 2));
    } catch (e) { return fail("Erro ao salvar o produto: " + e.message); }
  });

  server.tool("next_question", "Retorna o próximo grupo de perguntas da etapa (máx. 4), com opções e 'Recomendo por você' disponível.", {
    etapa: z.string().optional().describe("Etapa (default: etapa_atual da sessão)"),
    grupo: z.string().optional().describe("Grupo específico (ex.: 1, 2, tipo, pov, ugc_1)"),
  }, async (args) => {
    const estado = carregar();
    const etapa = args.etapa || estado.etapa_atual;
    const grupos = PERGUNTAS[etapa];
    if (!grupos || !grupos.length) return fail(`Etapa '${etapa}' sem perguntas mapeadas. Etapas disponíveis: ${Object.keys(PERGUNTAS).join(", ")}.`);
    const g = args.grupo ? grupos.find((x) => String(x.grupo) === String(args.grupo)) : grupos[0];
    return ok(JSON.stringify({ etapa_atual: estado.etapa_atual, etapa_solicitada: etapa, ...(g || grupos[0]) }, null, 2));
  });

  server.tool("recommend_cinematic_functions", "Etapa 1.5 — recomenda funções de câmera (/droneview, /closeup, /fullbody, /centerfocus, /orbit) compatíveis com o produto e o tipo de vídeo.", {
    categoria_produto: z.string().optional().describe("Default: categoria do produto na sessão"),
    tipo_video: z.string().optional().describe("POV ou UGC (default: ainda não definido)"),
    cenario_categoria: z.string().optional().describe("Categoria do cenário, se já conhecida"),
  }, async (args) => {
    try {
      const estado = carregar();
      const categoria = args.categoria_produto || (estado.produto && estado.produto.produto && estado.produto.produto.categoria) || "";
      const tipoVideo = args.tipo_video || "";
      const recs = recomendarFuncoes(categoria, tipoVideo, args.cenario_categoria || (estado.cenario && estado.cenario.categoria) || "");
      if (estado.produto) {
        estado.produto.funcoes_cinematograficas_recomendadas = recs;
        salvar(estado);
        fs.writeFileSync(path.join(ENTREGA_DIR, "json_imagem.json"), JSON.stringify(estado.produto, null, 2), "utf8");
      }
      return ok(JSON.stringify({
        recomendadas: recs,
        nota: "Recomende apenas funções que façam sentido; explique o benefício em 1 linha. O usuário pode escolher várias, nenhuma ou 'recomendo por você'. Recomendações podem ser reavaliadas após as etapas 2 e 3 (tipo de vídeo e cenário).",
        catalogo: {
          "/droneview": "perspectiva aérea com movimento de drone (cenários externos/amplos)",
          "/closeup no olho [direito/esquerdo]": "zoom no olhar (só com pessoa visível)",
          "/fullbody da pessoa [ação/cenário]": "corpo inteiro em ação contextualizada",
          "/centerfocus no [objeto] e embace os demais": "foco seletivo com bokeh",
          "/orbit": "rotação 360° ao redor do sujeito/objeto",
        },
        proximo_passo: "set_cinematic_functions (passe as escolhidas ou aceitar_recomendadas=true)",
      }, null, 2));
    } catch (e) { return fail("Erro: " + e.message); }
  });

  server.tool("set_cinematic_functions", "Registra as funções cinematográficas escolhidas no JSON do produto.", {
    funcoes: z.union([z.array(z.string()), z.string()]).transform((v) => (Array.isArray(v) ? v : v.split(",").map((s) => s.trim()).filter(Boolean))).optional().describe("Funções escolhidas (ex.: '/centerfocus no [produto] e embace os demais')"),
    aceitar_recomendadas: z.boolean().optional().describe("Aceitar automaticamente as recomendadas da sessão"),
  }, async (args) => {
    try {
      const estado = carregar();
      if (!estado.produto) return fail("Nenhum produto na sessão — rode save_product_json antes.");
      let escolhidas = args.funcoes || [];
      if (args.aceitar_recomendadas) escolhidas = (estado.produto.funcoes_cinematograficas_recomendadas || []).map((r) => r.funcao);
      if (!escolhidas.length && !args.aceitar_recomendadas) return fail("Informe 'funcoes' ou 'aceitar_recomendadas: true' (ou funcoes: ['nenhuma']).");
      estado.produto.funcoes_cinematograficas_escolhidas = escolhidas;
      estado.etapa_atual = "etapa2_personagem";
      salvar(estado);
      fs.writeFileSync(path.join(ENTREGA_DIR, "json_imagem.json"), JSON.stringify(estado.produto, null, 2), "utf8");
      return ok(JSON.stringify({
        escolhidas,
        proximo_passo: "Etapa 2 — pergunte o tipo de vídeo (POV/UGC) e configure o personagem com build_character_sheet.",
        pergunta_etapa_2: PERGUNTAS.etapa2_personagem[0],
      }, null, 2));
    } catch (e) { return fail("Erro: " + e.message); }
  });

  server.tool("build_character_sheet", "Etapa 2 — monta o JSON do personagem (UGC) ou da configuração POV com parâmetros de consistência.", {
    tipo_video: z.enum(["POV", "UGC"]),
    respostas: z.record(z.unknown()).optional().describe("Respostas do usuário (aceita chaves curtas: sexo, faixa_etaria, pele, cor_cabelo, comprimento_cabelo, textura_cabelo, estilo_cabelo, cor_olhos, bigode, barba, biotipo, altura, roupas, acessorios, expressao, personalidade, sotaque, identidade_cultural, parte_do_corpo, genero_aparente, mostrar_rosto)"),
  }, async (args) => {
    try {
      const r = args.respostas || {};
      const pegar = (chaves) => { for (const c of chaves) { if (r[c] !== undefined && r[c] !== null && r[c] !== "") return r[c]; } return undefined; };
      const lista = (chaves) => { const v = pegar(chaves); if (Array.isArray(v)) return v; if (typeof v === "string" && v) return v.split(",").map((s) => s.trim()).filter(Boolean); return []; };
      const f = (chaves) => pegar(chaves) || "nao_informado";
      const tipo = args.tipo_video;
      const personagem = {
        sexo_aparente: f(["sexo_aparente", "sexo", "apresentacao"]),
        idade_aparente: f(["idade_aparente", "idade"]),
        faixa_etaria: f(["faixa_etaria", "faixa_de_idade"]),
        aparencia_da_pele: f(["aparencia_da_pele", "pele", "tom_de_pele"]),
        identidade_cultural_escolhida: f(["identidade_cultural_escolhida", "identidade_cultural"]),
        cor_dos_olhos: f(["cor_dos_olhos", "olhos", "cor_olhos"]),
        cor_do_cabelo: f(["cor_do_cabelo", "cor_cabelo"]),
        comprimento_do_cabelo: f(["comprimento_do_cabelo", "comprimento_cabelo", "tamanho_do_cabelo"]),
        textura_do_cabelo: f(["textura_do_cabelo", "textura_cabelo"]),
        estilo_do_cabelo: f(["estilo_do_cabelo", "estilo_cabelo"]),
        bigode: f(["bigode"]),
        barba: f(["barba", "costeletas"]),
        biotipo: f(["biotipo", "corpo"]),
        altura_aparente: f(["altura_aparente", "altura"]),
        roupas: lista(["roupas", "roupa", "vestuario"]),
        acessorios: lista(["acessorios", "acessorio"]),
        expressao: f(["expressao", "expressao_facial"]),
        personalidade: f(["personalidade", "energia"]),
        idioma: "pt-BR",
        sotaque: f(["sotaque"]),
        estilo_de_apresentacao: tipo === "POV" ? "POV primeira pessoa" : "UGC natural",
      };
      const pov = tipo === "POV"
        ? { parte_do_corpo: lista(["parte_do_corpo", "partes_do_corpo", "perspectiva"]), genero_aparente: f(["genero_aparente", "genero"]), mostrar_rosto: Boolean(pegar(["mostrar_rosto"])) }
        : null;
      if (tipo === "POV" && pov.parte_do_corpo.length === 0) return fail("POV exige a parte do corpo/perspectiva (respostas.parte_do_corpo).");
      const pendentes = tipo === "POV"
        ? ["genero_aparente"].filter((k) => pov[k] === "nao_informado")
        : Object.entries(personagem).filter(([k, v]) => v === "nao_informado").map(([k]) => k);
      const json = {
        etapa: "personagem",
        tipo_video: tipo,
        personagem,
        ...(pov ? { pov } : {}),
        consistencia: { preservar_identidade_facial: true, preservar_aparencia: true, preservar_roupas: true, preservar_proporcoes: true },
        ...(pendentes.length ? { campos_pendentes: pendentes } : {}),
      };
      const estado = carregar();
      estado.personagem = json;
      estado.etapa_atual = "etapa3_cenario";
      salvar(estado);
      fs.writeFileSync(path.join(ENTREGA_DIR, "json_personagem.json"), JSON.stringify(json, null, 2), "utf8");
      return ok(JSON.stringify({ personagem_salvo: json, nota: pendentes.length ? "Campos pendentes ficaram como 'nao_informado' — nada foi inventado." : "Ficha completa.", proximo_passo: "Etapa 3 — defina o cenário com build_scene_json.", pergunta_cenario: PERGUNTAS.etapa3_cenario[0] }, null, 2));
    } catch (e) { return fail("Erro ao montar o personagem: " + e.message); }
  });

  server.tool("build_scene_json", "Etapa 3 — monta o JSON do cenário com zonas livres das plataformas do briefing.", {
    categoria: z.string().describe("Categoria (comercial, público, casa, natureza, profissional, estúdio, personalizado)"),
    local: z.string().optional(),
    comodo: z.string().optional(),
    periodo: z.string().optional(),
    clima: z.string().optional(),
    iluminacao: z.string().optional(),
    estilo_visual: z.string().optional(),
    elementos_secundarios: z.union([z.array(z.string()), z.string()]).transform((v) => (Array.isArray(v) ? v : v.split(",").map((s) => s.trim()).filter(Boolean))).optional(),
    movimento_ambiental: z.string().optional(),
    atmosfera: z.string().optional(),
    interacao_com_produto: z.string().optional(),
    restricoes: z.union([z.array(z.string()), z.string()]).transform((v) => (Array.isArray(v) ? v : v.split(",").map((s) => s.trim()).filter(Boolean))).optional(),
  }, async (args) => {
    try {
      const estado = carregar();
      const json = {
        etapa: "cenario",
        categoria: args.categoria,
        local: args.local || "",
        comodo: args.comodo || "",
        periodo: args.periodo || "",
        clima: args.clima || "",
        iluminacao: args.iluminacao || "",
        estilo_visual: args.estilo_visual || "",
        elementos_secundarios: args.elementos_secundarios || [],
        movimento_ambiental: args.movimento_ambiental || "",
        atmosfera: args.atmosfera || "",
        interacao_com_produto: args.interacao_com_produto || "",
        restricoes: args.restricoes || [],
        continuidade_espacial: true,
        zonas_livres_plataforma: zonasLivres(estado.briefing && estado.briefing.plataformas),
      };
      estado.cenario = json;
      estado.etapa_atual = "etapa4_dialogo";
      salvar(estado);
      fs.writeFileSync(path.join(ENTREGA_DIR, "json_cenario.json"), JSON.stringify(json, null, 2), "utf8");
      return ok(JSON.stringify({ cenario_salvo: json, proximo_passo: "Etapa 4 — escreva a fala do vendedor e valide com write_dialogue (orçamento: 4s ≈ 8-10 palavras; 6s ≈ 12-15; 8s ≈ 16-20)." }, null, 2));
    } catch (e) { return fail("Erro ao montar o cenário: " + e.message); }
  });

  server.tool("write_dialogue", "Etapa 4 — valida a fala do vendedor (pt-BR) contra o orçamento de palavras da duração-alvo (2–2,5 palavras/s).", {
    fala_pt_br: z.string().describe("Fala completa em português brasileiro (gancho + benefício + CTA)"),
    duracao_alvo: z.union([z.literal(4), z.literal(6), z.literal(8)]).default(4).describe("Duração-alvo em segundos (default 4 — a menor da matriz, garante caber em todas)"),
  }, async (args) => {
    try {
      const fala = String(args.fala_pt_br || "").trim();
      if (!fala) return fail("Informe a fala em 'fala_pt_br'. Estrutura: gancho + apresentação do produto + benefício verdadeiro/demonstrável + CTA. Sem garantias, sem depoimento falso, sem especificação não confirmada.");
      const palavras = fala.split(/\s+/).length;
      const [min, max] = ORCAMENTO_FALA[args.duracao_alvo];
      const t2 = palavras / 2, t25 = palavras / 2.5;
      const dentro = palavras >= min - 2 && palavras <= max + 3;
      const exagero = palavras > max * 1.25;
      const estado = carregar();
      estado.dialogo = { fala_pt_br: fala, palavras, duracao_alvo: args.duracao_alvo, dentro_do_orcamento: dentro && !exagero };
      estado.etapa_atual = "etapa5_geracao";
      salvar(estado);
      return ok(JSON.stringify({
        ok: dentro && !exagero,
        fala_pt_br: fala,
        palavras,
        orcamento_para: { duracao: args.duracao_alvo + "s", minimo: min, maximo: max },
        tempo_estimado: { a_2_palavras_por_segundo: t2.toFixed(1) + "s", a_2_5_palavras_por_segundo: t25.toFixed(1) + "s" },
        avaliacao: exagero ? "FALA LONGA DEMAIS para a duração-alvo — corte palavras ou valide em duração maior." : !dentro ? "Fora do orçamento, mas dentro da tolerância — considere ajustar." : "Dentro do orçamento.",
        nota: "A matriz gera 4, 6 e 8 s com o MESMO conceito: em 6/8 s a fala ganha pausas naturais; se a fala não couber em 4 s, os vídeos de 4 s precisarão de versão curta.",
        proximo_passo: "Etapa 5 — gere a matriz de 12 configurações com build_video_matrix.",
      }, null, 2));
    } catch (e) { return fail("Erro: " + e.message); }
  });

  server.tool("build_video_matrix", "Etapa 5 — gera o JSON final de criação de vídeo: conceito único, direção audiovisual, marca d'água, fala e as 12 configurações (Primeiro/Primeiro e Último × 9:16/16:9 × 4/6/8 s) com prompts EN adaptados.", {
    cta: z.string().optional().describe("Sobrescreve o CTA do briefing"),
  }, async (args) => {
    try {
      const estado = carregar();
      const faltam = [];
      if (!estado.produto) faltam.push("produto (save_product_json)");
      if (!estado.personagem) faltam.push("personagem (build_character_sheet)");
      if (!estado.cenario) faltam.push("cenario (build_scene_json)");
      if (!estado.dialogo) faltam.push("dialogo (write_dialogue)");
      if (faltam.length) return fail("Sessão incompleta — falta: " + faltam.join("; ") + ".");
      if (args && args.cta && estado.briefing) estado.briefing.cta = args.cta;
      const json = montarJsonVideo(estado);
      estado.video = json;
      estado.etapa_atual = "etapa5_concluido";
      salvar(estado);
      fs.writeFileSync(path.join(ENTREGA_DIR, "json_video.json"), JSON.stringify(json, null, 2), "utf8");
      fs.writeFileSync(path.join(ENTREGA_DIR, "prompts_video.txt"), json.configuracoes_video.map((c, i) => `===== CONFIG ${i + 1} | modo: ${c.modo_frames} | ${c.proporcao} | ${c.duracao_segundos}s =====\n\n${c.prompt_video_en}`).join("\n\n"), "utf8");
      return ok("Matriz de 12 configurações gerada e salva em data/entrega/ (json_video.json + prompts_video.txt).\n\n" + JSON.stringify(json, null, 2));
    } catch (e) { return fail("Erro ao gerar a matriz: " + e.message); }
  });

  server.tool("validate_json", "Valida sintaxe e campos obrigatórios de qualquer JSON do fluxo (etapa: produto | personagem | cenario | criacao_video).", {
    json: z.string().describe("JSON como texto (ou '@caminho/do/arquivo.json')"),
  }, async (args) => {
    try {
      const texto = resolverTexto(args.json);
      let obj;
      try { obj = JSON.parse(texto); } catch (e) { return fail("JSON inválido (erro de sintaxe): " + e.message); }
      const erros = validarEstrutura(obj);
      return ok(JSON.stringify({ json_valido: erros.length === 0, etapa_detectada: obj.etapa || null, total_erros: erros.length, erros }, null, 2));
    } catch (e) { return fail("Erro: " + e.message); }
  });

  server.tool("lint_prompt", "Aplica as regras absolutas num prompt de vídeo: proíbe referência de vídeo, exige marca d'água 'canalqb videos' e fala pt-BR entre aspas.", {
    prompt: z.string().describe("Prompt de vídeo como texto (ou '@caminho/do/arquivo.txt')"),
  }, async (args) => {
    try {
      const texto = resolverTexto(args.prompt);
      return ok(JSON.stringify(lintPrompt(texto), null, 2));
    } catch (e) { return fail("Erro: " + e.message); }
  });

  server.tool("watermark_video", "Aplica a marca d'água 'canalqb videos' num vídeo via FFmpeg (posição por proporção). Se o FFmpeg não estiver disponível, entrega o comando pronto.", {
    caminho_video: z.string().describe("Caminho do arquivo de vídeo (.mp4)"),
    proporcao: z.enum(["9:16", "16:9"]),
  }, async (args) => {
    try {
      const arquivo = path.resolve(args.caminho_video);
      if (!fs.existsSync(arquivo)) return fail(`Arquivo não encontrado: ${arquivo}`);
      const filtro = args.proporcao === "9:16"
        ? "drawtext=text='canalqb videos':fontcolor=white@0.6:fontsize=h*0.032:shadowcolor=black@0.4:shadowx=2:shadowy=2:x=w*0.05:y=h*0.16"
        : "drawtext=text='canalqb videos':fontcolor=white@0.6:fontsize=h*0.04:shadowcolor=black@0.4:shadowx=2:shadowy=2:x=w*0.04:y=h-th-h*0.04";
      const saida = arquivo.replace(/\.mp4$/i, "_marcada.mp4");
      const comandoExemplo = args.proporcao === "9:16" ? FFMPEG_9_16_CMD : FFMPEG_16_9_CMD;
      if (!temBin("ffmpeg")) {
        return ok(JSON.stringify({ aplicado: false, motivo: "FFmpeg não disponível neste ambiente — use o comando abaixo na pós-produção (100% confiável).", comando: comandoExemplo }, null, 2));
      }
      const r = spawnSync("ffmpeg", ["-y", "-i", arquivo, "-vf", filtro, "-c:a", "copy", saida], { encoding: "utf8", timeout: 300000 });
      if (r.status === 0) {
        return ok(JSON.stringify({ aplicado: true, video_com_marca: saida, aviso: "Se o texto gerado pela IA no vídeo vier errado, esta camada de pós-produção garante a marca correta." }, null, 2));
      }
      return fail("FFmpeg falhou: " + String(r.stderr || "").slice(-1500) + "\n\nComando manual:\n" + comandoExemplo);
    } catch (e) { return fail("Erro: " + e.message); }
  });

  server.tool("session_state", "Retorna o estado completo da sessão (briefing, produto, personagem, cenário, diálogo, vídeo) e a próxima ação.", {}, async () => {
    const estado = carregar();
    return ok(JSON.stringify({ ...estado, proxima_acao: proximaAcao(estado.etapa_atual), entrega_dir: ENTREGA_DIR }, null, 2));
  });

  return server;
}

// ---------- transporte ----------
function lerBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return reject(new Error("empty body"));
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

async function main() {
  const modoHttp = Boolean(process.env.PORT || process.env.RENDER || process.env.MCP_HTTP === "1");
  if (!modoHttp) {
    const server = criarServidor();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`[ai-product-studio-mcp] stdio pronto. Etapa da sessão: ${carregar().etapa_atual}`);
    return;
  }
  const porta = Number(process.env.PORT || 10000);
  const httpServer = http.createServer(async (req, res) => {
    let u;
    try { u = new URL(req.url, `http://${req.headers.host || "localhost"}`); } catch { res.writeHead(400); res.end(); return; }
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "POST, GET, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type, mcp-session-id, mcp-protocol-version, authorization");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    if (u.pathname === "/" || u.pathname === "/health") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("AI Product Studio MCP online — POST /mcp");
      return;
    }
    if (u.pathname !== "/mcp") { res.writeHead(404); res.end(); return; }
    if (req.method !== "POST") { res.writeHead(405, { allow: "POST, OPTIONS" }); res.end(); return; }
    try {
      const body = await lerBody(req);
      const server = criarServidor();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      if (!res.headersSent) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Bad request body" }, id: null }));
      }
    }
  });
  httpServer.listen(porta, () => console.error(`[ai-product-studio-mcp] HTTP /mcp escutando na porta ${porta}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
