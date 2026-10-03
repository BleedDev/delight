import { defineStrings } from "@evi/api";

export const t = defineStrings({
    en: {
        "counter.loading": "Counting blocked requests…",
        "counter.blocked": {
            one: "Blocked {count} tracking request since Discord started.",
            other: "Blocked {count} tracking requests since Discord started.",
        },
        "counter.stopped": {
            one: "Stopped {count} analytics event before it was queued.",
            other: "Stopped {count} analytics events before they were queued.",
        },
    },
    de: {
        "counter.loading": "Blockierte Anfragen werden gezählt …",
        "counter.blocked": {
            one: "{count} Tracking-Anfrage seit dem Start von Discord blockiert.",
            other: "{count} Tracking-Anfragen seit dem Start von Discord blockiert.",
        },
        "counter.stopped": {
            one: "{count} Analyse-Ereignis gestoppt, bevor es in die Warteschlange kam.",
            other: "{count} Analyse-Ereignisse gestoppt, bevor sie in die Warteschlange kamen.",
        },
    },
    es: {
        "counter.loading": "Contando solicitudes bloqueadas…",
        "counter.blocked": {
            one: "{count} solicitud de rastreo bloqueada desde que se inició Discord.",
            other: "{count} solicitudes de rastreo bloqueadas desde que se inició Discord.",
        },
        "counter.stopped": {
            one: "{count} evento de analíticas detenido antes de ponerse en cola.",
            other: "{count} eventos de analíticas detenidos antes de ponerse en cola.",
        },
    },
    fr: {
        "counter.loading": "Comptage des requêtes bloquées…",
        "counter.blocked": {
            one: "{count} requête de suivi bloquée depuis le lancement de Discord.",
            other: "{count} requêtes de suivi bloquées depuis le lancement de Discord.",
        },
        "counter.stopped": {
            one: "{count} événement d'analyse arrêté avant sa mise en file d'attente.",
            other: "{count} événements d'analyse arrêtés avant leur mise en file d'attente.",
        },
    },
    ja: {
        "counter.loading": "ブロックしたリクエストを集計中…",
        "counter.blocked": {
            other: "Discordの起動以降、トラッキングリクエストを{count}件ブロックしました。",
        },
        "counter.stopped": {
            other: "分析イベントを{count}件、送信待ちに入る前に止めました。",
        },
    },
    pl: {
        "counter.loading": "Liczenie zablokowanych żądań…",
        "counter.blocked": {
            one: "Zablokowano {count} żądanie śledzące od uruchomienia Discorda.",
            few: "Zablokowano {count} żądania śledzące od uruchomienia Discorda.",
            many: "Zablokowano {count} żądań śledzących od uruchomienia Discorda.",
            other: "Zablokowano {count} żądania śledzącego od uruchomienia Discorda.",
        },
        "counter.stopped": {
            one: "Zatrzymano {count} zdarzenie analityczne, zanim trafiło do kolejki.",
            few: "Zatrzymano {count} zdarzenia analityczne, zanim trafiły do kolejki.",
            many: "Zatrzymano {count} zdarzeń analitycznych, zanim trafiły do kolejki.",
            other: "Zatrzymano {count} zdarzenia analitycznego, zanim trafiły do kolejki.",
        },
    },
    "pt-BR": {
        "counter.loading": "Contando solicitações bloqueadas…",
        "counter.blocked": {
            one: "{count} solicitação de rastreamento bloqueada desde que o Discord foi iniciado.",
            other: "{count} solicitações de rastreamento bloqueadas desde que o Discord foi iniciado.",
        },
        "counter.stopped": {
            one: "{count} evento de análise parado antes de entrar na fila.",
            other: "{count} eventos de análise parados antes de entrar na fila.",
        },
    },
    ru: {
        "counter.loading": "Подсчёт заблокированных запросов…",
        "counter.blocked": {
            one: "Заблокирован {count} запрос отслеживания с момента запуска Discord.",
            few: "Заблокировано {count} запроса отслеживания с момента запуска Discord.",
            many: "Заблокировано {count} запросов отслеживания с момента запуска Discord.",
            other: "Заблокировано {count} запроса отслеживания с момента запуска Discord.",
        },
        "counter.stopped": {
            one: "Остановлено {count} событие аналитики до постановки в очередь.",
            few: "Остановлено {count} события аналитики до постановки в очередь.",
            many: "Остановлено {count} событий аналитики до постановки в очередь.",
            other: "Остановлено {count} события аналитики до постановки в очередь.",
        },
    },
    tr: {
        "counter.loading": "Engellenen istekler sayılıyor…",
        "counter.blocked": {
            one: "Discord başladığından beri {count} izleme isteği engellendi.",
            other: "Discord başladığından beri {count} izleme isteği engellendi.",
        },
        "counter.stopped": {
            one: "{count} analiz olayı kuyruğa girmeden durduruldu.",
            other: "{count} analiz olayı kuyruğa girmeden durduruldu.",
        },
    },
});
