# Project Documentation: Voice-Driven Party Roadmap Game

---

### 1. What We Are Building

We are building an interactive, competitive **voice-driven mini-game system** that serves as the foundation and qualifying layer for a larger **"Roadmap" party game** (inspired by *Stickman Party* style board progression).

#### **Core Features:**

* **Voice-Based Mini-Games:** Players answer math problems, complete trivia, or attempt language pronunciation challenges (starting with **Hausa, Igbo, Yoruba**, and expanding to **French, German, Japanese, Chinese, Korean, Indian**, etc.) using real-time speech-to-text.
* **System-Generated Prompts & Timing:** The application supplies timed prompts to test speed, accuracy, and clarity.
* **Buff / Debuff System:** Mini-game points translate into usable power-ups on the main game roadmap (e.g., boosts, rewinds, or "Dare/Punishment" attacks).
* **Peer-Reviewed Dares:** Players can issue "punishment" challenges to opponents (such as singing a prompt), where the opposing player acts as the judge to approve or fail the attempt.

---

### 2. Why We Are Building It

* **Interactive & Fun Alternative:** Standard text-based or WhatsApp guessing games lack competition and automated timing. Voice inputs create a lively, real-time party dynamic.
* **Strategic Depth:** Combining rapid voice challenges with a strategic board game roadmap keeps gameplay engaging over long sessions.
* **Cultural & Language Exposure:** Integrating local Nigerian languages alongside global ones makes the game educational, expressive, and widely appealing.

---

### 3. How We Are Building It

#### **A. Tech Stack & Architecture**

* **Frontend UI:** Built using **Next.js** or **Vite (React)** for a fast, responsive, and lightweight web app interface.
* **AI-Assisted Development Pipeline:** Leveraging LLMs and code generation tools to rapidly scaffold features and iterate fast.
* **Voice Processing:** Speech-to-Text (STT) web integration to process live voice inputs and verify responses or timing metrics.

#### **B. Visual Style & User Experience**

* **Interface:** Clean, vibrant, and approachable with large, easy-to-tap targets for fast mobile or desktop play.
* **Avatars & Characters:** Lightweight, colorful, and expressive caricature-style characters to keep the tone humorous and friendly.

#### **C. Core Gameplay Loop**

1. **Qualifying Round (Mini-Game):** Players trigger a voice prompt (Math, Trivia, or Pronunciation challenge) and speak their response within a timed window.
2. **Point & Power-up Allocation:** Speed and accuracy award points used to purchase board buffs/weapons (e.g., *Dare Gun*, *Rewind*, *Boost*).
3. **Roadmap Progression:** Players take turns moving along the main board, using acquired power-ups or issuing voice "dares" to hinder opponents.
