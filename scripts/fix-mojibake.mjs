// OllCLin - Corretor de mojibake (UTF-8 lido como Latin-1) em arquivo
// Uso: node.cmd scripts/fix-mojibake.mjs <arquivo>
import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Uso: node.cmd scripts/fix-mojibake.mjs <arquivo>");
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");

// Pares latin1->utf8 mais comuns em pt-BR — construídos por código de caractere
// para evitar que este próprio arquivo sofra mojibake.
const U = String.fromCharCode;
const pairs = [
  [U(0xC3, 0xA3), "ã"], [U(0xC3, 0xB5), "õ"], [U(0xC3, 0xA7), "ç"],
  [U(0xC3, 0xA9), "é"], [U(0xC3, 0xAA), "ê"], [U(0xC3, 0xAD), "í"],
  [U(0xC3, 0xB3), "ó"], [U(0xC3, 0xB4), "ô"], [U(0xC3, 0xBA), "ú"],
  [U(0xC3, 0xA0), "à"], [U(0xC3, 0x89), "É"], [U(0xC3, 0x8A), "Ê"],
  [U(0xC3, 0x8D), "Í"], [U(0xC3, 0x93), "Ó"], [U(0xC3, 0x94), "Ô"],
  [U(0xC3, 0x9A), "Ú"], [U(0xC3, 0x87), "Ç"], [U(0xC2, 0x82), "‚"],
  [U(0xC3, 0x81), "Á"], [U(0xC3, 0x80), "À"], [U(0xC3, 0xA1), "á"],
  [U(0xC3, 0xA2), "â"], [U(0xC3, 0xAE), "î"], [U(0xC3, 0xAF), "ï"],
  ["â€“", "–"], ["â€œ", "\u201C"], ["â€", "\u201D"],
];

for (const [bad, good] of pairs) {
  s = s.split(bad).join(good);
}

fs.writeFileSync(file, s, "utf8");

const remaining = s.match(/[\u00C0-\u00DF][\u0080-\u00BF]/g) ?? [];
console.log(`Corrigido. Sequências suspeitas restantes: ${remaining.length}`);
if (remaining.length > 0) console.log(remaining.slice(0, 10));
