// Curated registry of AI/ML benchmark datasets -> their authoritative leaderboard.
//
// This is the core value of the server: there is NO single live API that covers
// every benchmark (Papers With Code, the closest thing, was sunset by Meta on
// 2025-07-25 and now only exists as a static GitHub archive). The landscape is
// fragmented, so we encode, per benchmark, WHERE the canonical leaderboard is and
// HOW trustworthy it is. Honesty about fragmentation is the point.

export type Authority =
  | "official" //            run by the benchmark's own authors/maintainers
  | "community-standard" //  no official board, but one widely-trusted maintained source
  | "archived" //            the de-facto standard is no longer live-updated
  | "fragmented"; //         no single trustworthy source; results are scattered

export type Modality =
  | "vision"
  | "language"
  | "code"
  | "multimodal"
  | "embedding"
  | "speech"
  | "rl"
  | "tabular";

export interface Leaderboard {
  name: string;
  url: string;
  authority: Authority;
  note?: string;
}

export interface Benchmark {
  id: string;
  name: string;
  aliases: string[];
  task: string;
  modality: Modality;
  metric: string;
  canonical: Leaderboard;
  alternatives?: Leaderboard[];
  notes?: string;
}

export const REGISTRY: Benchmark[] = [
  // ---- Vision ----
  {
    id: "cifar-10",
    name: "CIFAR-10",
    aliases: ["cifar10", "cifar 10"],
    task: "Image Classification",
    modality: "vision",
    metric: "Top-1 Accuracy (%)",
    canonical: {
      name: "Papers With Code — Image Classification on CIFAR-10",
      url: "https://paperswithcode.com/sota/image-classification-on-cifar-10",
      authority: "archived",
      note: "PwC was the de-facto standard but Meta sunset it on 2025-07-25; the page now redirects. A static snapshot lives in the paperswithcode/paperswithcode-data GitHub mirror.",
    },
    alternatives: [
      {
        name: "RobustBench (CIFAR-10)",
        url: "https://robustbench.github.io/",
        authority: "community-standard",
        note: "Adversarial-robustness leaderboard, not clean top-1 accuracy. Canonical only for the robustness question.",
      },
      {
        name: "Kaggle competitions",
        url: "https://www.kaggle.com/search?q=cifar-10+in%3Acompetitions",
        authority: "fragmented",
        note: "Multiple unrelated community competitions; none is the canonical CIFAR-10 SOTA board.",
      },
    ],
    notes:
      "There is NO official CIFAR-10 leaderboard. Current SOTA is ~99.5%+ (top studies report ~99.9%). Compare protocols, not just numbers: SOTA claims differ on preprocessing, augmentation, and whether extra training data is used.",
  },
  {
    id: "cifar-100",
    name: "CIFAR-100",
    aliases: ["cifar100", "cifar 100"],
    task: "Image Classification",
    modality: "vision",
    metric: "Top-1 Accuracy (%)",
    canonical: {
      name: "Papers With Code — Image Classification on CIFAR-100",
      url: "https://paperswithcode.com/sota/image-classification-on-cifar-100",
      authority: "archived",
      note: "Same status as CIFAR-10: PwC sunset 2025-07-25, static archive only.",
    },
    alternatives: [
      {
        name: "RobustBench (CIFAR-100)",
        url: "https://robustbench.github.io/",
        authority: "community-standard",
        note: "Robustness only.",
      },
      {
        name: "DeepOBS CIFAR-100 leaderboard",
        url: "https://deepobs.github.io/",
        authority: "community-standard",
        note: "Optimizer-focused board; narrow scope.",
      },
    ],
    notes: "No official leaderboard; same preprocessing caveats as CIFAR-10.",
  },
  {
    id: "imagenet",
    name: "ImageNet (ILSVRC 2012)",
    aliases: ["imagenet-1k", "ilsvrc", "ilsvrc2012", "imagenet1k", "image net"],
    task: "Image Classification",
    modality: "vision",
    metric: "Top-1 Accuracy (%)",
    canonical: {
      name: "Papers With Code — Image Classification on ImageNet",
      url: "https://paperswithcode.com/sota/image-classification-on-imagenet",
      authority: "archived",
      note: "PwC sunset 2025-07-25; static archive only.",
    },
    alternatives: [
      {
        name: "CodeSOTA — ImageNet-1K",
        url: "https://www.codesota.com/benchmark/imagenet-1k",
        authority: "community-standard",
        note: "PwC-style SOTA table actively maintained since PwC's shutdown (current leader ~91% top-1, e.g. CoCa).",
      },
      {
        name: "timm (PyTorch Image Models) results",
        url: "https://github.com/huggingface/pytorch-image-models/blob/main/results/README.md",
        authority: "community-standard",
        note: "Reproducible, maintained model comparison table — often more useful than raw SOTA claims.",
      },
    ],
    notes:
      "Watch the variant: plain ImageNet-1k val vs ImageNet-ReaL, ImageNet-V2, ImageNet-A/R measure different things. Top results often use extra pretraining data (e.g. JFT, ImageNet-21k).",
  },
  {
    id: "mnist",
    name: "MNIST",
    aliases: ["mnist digits"],
    task: "Image Classification",
    modality: "vision",
    metric: "Test Error (%)",
    canonical: {
      name: "Papers With Code — Image Classification on MNIST",
      url: "https://paperswithcode.com/sota/image-classification-on-mnist",
      authority: "archived",
      note: "PwC sunset 2025-07-25; static archive only.",
    },
    notes: "Effectively solved (~0.1-0.2% error); of historical interest. Treat tiny differences as noise.",
  },
  {
    id: "coco",
    name: "COCO (Object Detection)",
    aliases: ["ms coco", "mscoco", "coco detection"],
    task: "Object Detection",
    modality: "vision",
    metric: "box AP (mAP @ IoU 0.50:0.95)",
    canonical: {
      name: "COCO Detection Leaderboard (official)",
      url: "https://cocodataset.org/#detection-leaderboard",
      authority: "official",
      note: "Run by the COCO consortium; submissions via the CodaLab test-dev eval server (still active in 2026).",
    },
    alternatives: [
      {
        name: "Papers With Code — Object Detection on COCO",
        url: "https://paperswithcode.com/sota/object-detection-on-coco",
        authority: "archived",
        note: "Broader research SOTA table, but archived (PwC sunset).",
      },
    ],
    notes: "Report test-dev AP for comparability; val AP is not directly comparable across papers.",
  },

  // ---- Language / LLM ----
  {
    id: "lmarena",
    name: "LMArena (Chatbot Arena)",
    aliases: ["chatbot arena", "lmsys arena", "arena", "lmsys", "arena elo"],
    task: "Human-preference ranking",
    modality: "language",
    metric: "Arena Elo (Bradley-Terry)",
    canonical: {
      name: "LMArena Leaderboard (official)",
      url: "https://lmarena.ai/leaderboard",
      authority: "official",
      note: "Successor to LMSYS Chatbot Arena. Pairwise blind human-preference votes -> Elo, across ~9 categories (Text, Code, Vision, WebDev, ...).",
    },
    notes:
      "The single most-watched overall LLM ranking in 2026. Measures human preference, not capability per se — strong on style/helpfulness, weak as a proxy for hard reasoning.",
  },
  {
    id: "helm",
    name: "HELM (Holistic Evaluation of Language Models)",
    aliases: ["stanford helm", "crfm helm"],
    task: "Holistic LLM evaluation",
    modality: "language",
    metric: "Many (accuracy, calibration, robustness, ...)",
    canonical: {
      name: "Stanford CRFM HELM (official)",
      url: "https://crfm.stanford.edu/helm/",
      authority: "official",
      note: "Multiple scenario-specific leaderboards (Lite, Classic, MMLU, MedHELM, Long-Context, ...). Entered maintenance mode on 2026-06-01; existing leaderboards remain accessible.",
    },
    notes: "Pick the specific HELM leaderboard that matches your scenario; there is no single HELM number.",
  },
  {
    id: "open-llm-leaderboard",
    name: "Open LLM Leaderboard",
    aliases: ["hf leaderboard", "huggingface leaderboard", "open llm"],
    task: "Open-weight LLM evaluation",
    modality: "language",
    metric: "Average of IFEval, BBH, MATH, GPQA, MUSR, MMLU-Pro",
    canonical: {
      name: "Hugging Face Open LLM Leaderboard",
      url: "https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard",
      authority: "community-standard",
      note: "v1 archived; now on a contamination-hardened v2/v3 and still actively updated in 2026. Open-weight models only (no closed APIs).",
    },
    alternatives: [
      {
        name: "OpenEvals — every-leaderboards (HF)",
        url: "https://huggingface.co/spaces/OpenEvals/every-leaderboards",
        authority: "community-standard",
        note: "Unified view aggregating official HF benchmark leaderboards.",
      },
    ],
    notes: "Best for comparing open-weight models on automatic benchmarks. Does not include closed frontier APIs.",
  },
  {
    id: "mmlu",
    name: "MMLU",
    aliases: ["massive multitask language understanding", "mmlu accuracy"],
    task: "Multitask knowledge QA",
    modality: "language",
    metric: "Accuracy (%)",
    canonical: {
      name: "MMLU — no single official leaderboard",
      url: "https://github.com/hendrycks/test",
      authority: "fragmented",
      note: "The repo hosts the dataset, not a live ranking. Labs self-report; aggregators differ on prompting/shots.",
    },
    alternatives: [
      { name: "llm-stats.com — MMLU", url: "https://llm-stats.com/benchmarks/mmlu", authority: "community-standard", note: "Aggregates self-reported scores across closed + open models (live)." },
      { name: "Open LLM Leaderboard (MMLU-Pro)", url: "https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard", authority: "community-standard" },
    ],
    notes:
      "By 2026 MMLU is saturated ('hygiene minimum', top models ~90%+). Numbers swing with 0- vs 5-shot and prompt format, so cross-source comparisons are unreliable. Prefer MMLU-Pro / GPQA for differentiation.",
  },
  {
    id: "mmlu-pro",
    name: "MMLU-Pro",
    aliases: ["mmlu pro"],
    task: "Harder multitask QA",
    modality: "language",
    metric: "Accuracy (%)",
    canonical: {
      name: "TIGER-Lab MMLU-Pro",
      url: "https://huggingface.co/spaces/TIGER-Lab/MMLU-Pro",
      authority: "community-standard",
      note: "Maintained by the benchmark's authors; also a column on the Open LLM Leaderboard.",
    },
    notes: "Harder, 10-choice version of MMLU; more discriminative in 2026 but also nearing saturation at the top (~89-90%).",
  },
  {
    id: "gpqa",
    name: "GPQA (Diamond)",
    aliases: ["gpqa diamond", "graduate-level qa", "google-proof qa"],
    task: "Graduate-level hard reasoning QA",
    modality: "language",
    metric: "Accuracy (%) — usually GPQA-Diamond",
    canonical: {
      name: "GPQA (official dataset + paper)",
      url: "https://github.com/idavidrein/gpqa",
      authority: "community-standard",
      note: "No official live board; the Diamond subset is reported on vendor model cards and aggregators.",
    },
    alternatives: [
      { name: "Epoch AI — GPQA Diamond", url: "https://epoch.ai/benchmarks/gpqa-diamond", authority: "community-standard", note: "Independent, maintained cross-model tracking." },
      { name: "llm-stats.com — GPQA", url: "https://llm-stats.com/benchmarks/gpqa", authority: "community-standard" },
    ],
    notes: "A primary 2026 'hard reasoning' differentiator, though now largely saturated (top models ~95%, well above the ~70% expert baseline). Always check it is GPQA-Diamond and the shot/format.",
  },
  {
    id: "gsm8k",
    name: "GSM8K",
    aliases: ["grade school math 8k", "gsm-8k"],
    task: "Grade-school math word problems",
    modality: "language",
    metric: "Accuracy (%)",
    canonical: {
      name: "Papers With Code — Arithmetic Reasoning on GSM8K",
      url: "https://paperswithcode.com/sota/arithmetic-reasoning-on-gsm8k",
      authority: "archived",
      note: "PwC sunset 2025-07-25; static archive only.",
    },
    alternatives: [
      { name: "llm-stats.com — GSM8K", url: "https://llm-stats.com/benchmarks/gsm8k", authority: "community-standard", note: "Live current rankings (the PwC table is a historical snapshot)." },
    ],
    notes: "Saturated by 2026 (top models >99%). Use MATH / AIME for current math signal.",
  },
  {
    id: "math",
    name: "MATH",
    aliases: ["hendrycks math", "competition math", "math-500", "math 500"],
    task: "Competition mathematics",
    modality: "language",
    metric: "Accuracy (%)",
    canonical: {
      name: "MATH (official dataset)",
      url: "https://github.com/hendrycks/math",
      authority: "fragmented",
      note: "Dataset repo, not a live board. Tracked via aggregators below.",
    },
    alternatives: [
      { name: "llm-stats.com — MATH-500", url: "https://llm-stats.com/benchmarks/math-500", authority: "community-standard", note: "MATH-500 (a 500-problem subset) is the commonly tracked variant in 2026." },
      { name: "Epoch AI Benchmarking Hub", url: "https://epoch.ai/benchmarks", authority: "community-standard" },
    ],
    notes: "Largely saturated (top models >99% on MATH-500); the harder MATH-500 split and AIME are the discriminative variants in 2026.",
  },
  {
    id: "aime",
    name: "AIME (2026 / 2025)",
    aliases: ["aime 2026", "aime 2025", "aime 2024", "american invitational mathematics examination"],
    task: "Olympiad-style math",
    modality: "language",
    metric: "Accuracy (%) / problems solved",
    canonical: {
      name: "MathArena",
      url: "https://matharena.ai/",
      authority: "community-standard",
      note: "Independent, maintained tracking of frontier models on AIME and other olympiads with contamination controls.",
    },
    notes:
      "AIME 2025 is now saturated (top models 98%+); AIME 2026 is the primary competition-math signal on MathArena, with 'MathArena Apex' as a harder aggregate. Specify the year — older years risk training-set contamination.",
  },
  {
    id: "humaneval",
    name: "HumanEval",
    aliases: ["human eval", "openai humaneval"],
    task: "Function-level code generation",
    modality: "code",
    metric: "pass@1 (%)",
    canonical: {
      name: "EvalPlus Leaderboard (HumanEval+)",
      url: "https://evalplus.github.io/leaderboard.html",
      authority: "community-standard",
      note: "Maintained; uses HumanEval+ with extra tests to curb overfitting. Preferred over the archived PwC table.",
    },
    alternatives: [
      { name: "Papers With Code — Code Generation on HumanEval", url: "https://paperswithcode.com/sota/code-generation-on-humaneval", authority: "archived" },
    ],
    notes: "Saturated by 2026 (top models >95% pass@1). Use SWE-bench Verified for real-world coding signal.",
  },
  {
    id: "swe-bench",
    name: "SWE-bench (Verified)",
    aliases: ["swebench", "swe bench", "swe-bench verified", "swe-bench pro"],
    task: "Real-world software issue resolution",
    modality: "code",
    metric: "% Resolved",
    canonical: {
      name: "SWE-bench Leaderboard (official)",
      url: "https://www.swebench.com/",
      authority: "official",
      note: "Official board with Verified / Full / Lite / Multimodal splits. A harder 'SWE-bench Pro' (Scale) also exists.",
    },
    notes:
      "The primary 2026 agentic-coding benchmark (top models ~95% on Verified). Compare on the SAME split (Verified is the standard) and note whether a scaffold/agent is used.",
  },
  {
    id: "hle",
    name: "Humanity's Last Exam (HLE)",
    aliases: ["humanitys last exam", "last exam", "hle"],
    task: "Extremely hard expert QA",
    modality: "language",
    metric: "Accuracy (%)",
    canonical: {
      name: "Humanity's Last Exam Leaderboard (Scale Labs, official)",
      url: "https://labs.scale.com/leaderboard/humanitys_last_exam",
      authority: "official",
      note: "Live official leaderboard hosted by Scale AI (project site: lastexam.ai). Maintained by CAIS + Scale AI; 2,500 questions.",
    },
    notes: "A 2026 frontier signal: top models still score low (~40-45% without heavy scaffolding), so it discriminates well at the top end.",
  },

  // ---- Embedding / NLP ----
  {
    id: "mteb",
    name: "MTEB (Massive Text Embedding Benchmark)",
    aliases: ["text embedding benchmark"],
    task: "Text embeddings",
    modality: "embedding",
    metric: "Mean score across tasks",
    canonical: {
      name: "MTEB Leaderboard (official)",
      url: "https://huggingface.co/spaces/mteb/leaderboard",
      authority: "official",
      note: "Maintained by the MTEB authors on Hugging Face (5,000+ submissions). Use the MTEB v2 / MMTEB views for current models.",
    },
    notes: "The standard embedding-model board. Filter to the language/task family you care about; the global average can mislead.",
  },
  {
    id: "glue",
    name: "GLUE / SuperGLUE",
    aliases: ["glue benchmark", "superglue", "super glue"],
    task: "Natural language understanding",
    modality: "language",
    metric: "Benchmark score",
    canonical: {
      name: "SuperGLUE Leaderboard (official)",
      url: "https://super.gluebenchmark.com/leaderboard",
      authority: "official",
      note: "Still live in 2026 but historical: GLUE (https://gluebenchmark.com/leaderboard) is its predecessor; frontier labs no longer submit (both are saturated).",
    },
    notes: "Of historical importance; superseded by harder LLM benchmarks for frontier comparison.",
  },
  {
    id: "squad",
    name: "SQuAD 2.0",
    aliases: ["squad", "stanford question answering dataset"],
    task: "Extractive question answering",
    modality: "language",
    metric: "F1 / Exact Match",
    canonical: {
      name: "SQuAD2.0 Explorer (official)",
      url: "https://rajpurkar.github.io/SQuAD-explorer/",
      authority: "official",
      note: "Official Stanford board; effectively dormant — new frontier submissions are rare.",
    },
    notes: "Historical; useful as a classic reading-comprehension reference, not a frontier signal.",
  },

  // ---- Multimodal ----
  {
    id: "mmmu",
    name: "MMMU",
    aliases: ["massive multi-discipline multimodal understanding"],
    task: "College-level multimodal QA",
    modality: "multimodal",
    metric: "Accuracy (%)",
    canonical: {
      name: "MMMU Leaderboard (official)",
      url: "https://mmmu-benchmark.github.io/#leaderboard",
      authority: "official",
      note: "Maintained by the MMMU authors. A harder MMMU-Pro variant is the more discriminative 2026 board.",
    },
    notes: "The standard 2026 board for multimodal (image+text) reasoning, nearing saturation (~86% on MMMU, near the ~89% human-expert mark). Note Val vs Test split.",
  },
  {
    id: "gaia",
    name: "GAIA (General AI Assistants)",
    aliases: ["gaia benchmark"],
    task: "Agentic assistant tasks",
    modality: "multimodal",
    metric: "Accuracy (%)",
    canonical: {
      name: "GAIA Leaderboard (official)",
      url: "https://huggingface.co/spaces/gaia-benchmark/leaderboard",
      authority: "official",
      note: "Maintained on Hugging Face by the GAIA authors.",
    },
    notes: "A standard board for tool-using assistant agents. Levels 1-3 differ greatly in difficulty, and the agent scaffold can swing scores by ~30 points — compare like-for-like.",
  },
];

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Best single match for a free-text dataset name, or undefined. */
export function findBenchmark(query: string): Benchmark | undefined {
  const q = norm(query);
  if (!q) return undefined;
  const keys = (b: Benchmark): string[] => [b.id, b.name, ...b.aliases].map(norm);

  // 1) exact key match
  for (const b of REGISTRY) if (keys(b).includes(q)) return b;
  // 2) a key starts with the query, or the query starts with a key
  for (const b of REGISTRY) if (keys(b).some((k) => k.startsWith(q) || q.startsWith(k))) return b;
  // 3) substring either direction
  for (const b of REGISTRY) if (keys(b).some((k) => k.includes(q) || q.includes(k))) return b;
  return undefined;
}

/** Loose search returning all plausible matches (for suggestions / browsing). */
export function searchBenchmarks(query: string): Benchmark[] {
  const q = norm(query);
  if (!q) return [...REGISTRY];
  return REGISTRY.filter((b) =>
    [b.id, b.name, b.task, b.modality, ...b.aliases].some((k) => norm(k).includes(q) || q.includes(norm(k))),
  );
}
