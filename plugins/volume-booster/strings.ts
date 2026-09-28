import { defineStrings } from "@evi/api";

export const t = defineStrings({
    en: {
        "settings.multiplier": "Volume limit",
        "settings.multiplier.description": "How far past Discord's 200% the slider goes: 2 is 400%, 5 is 1000%. Very high volumes clip and distort.",
    },
    de: {
        "settings.multiplier": "Lautstärkegrenze",
        "settings.multiplier.description": "Wie weit der Regler über die 200 % von Discord hinausgeht: 2 sind 400 %, 5 sind 1000 %. Sehr hohe Lautstärken übersteuern und verzerren.",
    },
    es: {
        "settings.multiplier": "Límite de volumen",
        "settings.multiplier.description": "Cuánto pasa el control deslizante del 200 % de Discord: 2 es 400 %, 5 es 1000 %. Los volúmenes muy altos saturan y distorsionan.",
    },
    fr: {
        "settings.multiplier": "Limite de volume",
        "settings.multiplier.description": "Jusqu'où le curseur dépasse les 200 % de Discord : 2 donne 400 %, 5 donne 1000 %. Un volume très élevé sature et déforme le son.",
    },
    ja: {
        "settings.multiplier": "音量の上限",
        "settings.multiplier.description": "スライダーをDiscordの200%からどこまで引き上げるか。2なら400%、5なら1000%。音量が大きすぎると音割れして歪みます。",
    },
    pl: {
        "settings.multiplier": "Limit głośności",
        "settings.multiplier.description": "O ile suwak wykracza poza 200% Discorda: 2 to 400%, 5 to 1000%. Bardzo wysoka głośność powoduje przesterowanie i zniekształcenia.",
    },
    "pt-BR": {
        "settings.multiplier": "Limite de volume",
        "settings.multiplier.description": "Até onde o controle passa dos 200% do Discord: 2 é 400%, 5 é 1000%. Volumes muito altos estouram e distorcem o som.",
    },
    ru: {
        "settings.multiplier": "Предел громкости",
        "settings.multiplier.description": "Насколько ползунок выходит за 200% в Discord: 2 — это 400%, 5 — 1000%. Очень высокая громкость приводит к искажениям и хрипам.",
    },
    tr: {
        "settings.multiplier": "Ses sınırı",
        "settings.multiplier.description": "Kaydırıcının Discord'un %200 sınırının ne kadar ötesine geçeceği: 2, %400; 5, %1000 demektir. Çok yüksek sesler patlar ve bozulur.",
    },
});
