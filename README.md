# 2025-2026-team-5-repo

## Team Information

### Team 5

- **Team Leader**: Melih DIVAN (221401020)

## Supervisor

- **Dr. Ugur CORUH** – ugur.coruh@erdogan.edu.tr

## About the Project

The aim of this project is to develop an AI-powered review analysis and insight platform that collects user reviews from multiple e-commerce platforms and forums (such as leading e-commerce sites) in an ethical and compliant way, and then performs aspect-based sentiment analysis (ABSA) on them.

Instead of assigning only a single global sentiment score to a product, the system automatically extracts fine-grained product-level aspects (e.g., battery life, screen quality, performance, customer service) and determines the sentiment for each aspect separately (positive, negative, neutral). Using multi-source data fusion, BERT-based sentence-transformer embeddings, and large language models (LLMs), the platform aims to identify the strengths and weaknesses of products, aggregate them into an aspect–sentiment map, and present the results to users through interactive dashboards and downloadable reports.

**Project Objectives**

- Collect user reviews from multiple e-commerce platforms and forums in full compliance with robots.txt, rate limiting, and platform policies.  
- Design a data cleaning and normalization pipeline that removes duplicates, spam, and corrupted text.  
- Build an aspect-based sentiment analysis pipeline using BERT-based sentence-transformer embeddings and an LLM (e.g., gemini-2.5-pro or an equivalent model) to detect aspects and their sentiment with at least 80% accuracy.  
- Develop a user-friendly dashboard (web UI) that visualizes aspect-level sentiment distributions and highlights representative review snippets.  
- Evaluate system performance using metrics such as Precision, Recall, F1-Score, and user satisfaction surveys.  

**Project Scope**

- Develop an ethical data collection layer (scraper) using Node.js and Playwright, respecting robots.txt and rate limiting constraints.  
- Implement a Python-based preprocessing pipeline using BeautifulSoup, fastText, and sentence-transformers for HTML parsing, language detection, normalization, and duplicate/near-duplicate filtering.  
- Design and implement an ABSA pipeline that uses sentence-transformer embeddings and an LLM to extract aspects and classify sentiment (positive, negative, neutral) per aspect.  
- Build backend services with FastAPI to provide product search, summaries, and export endpoints (JSON/CSV/PDF).  
- Implement a React-based frontend using Ant Design and Recharts to present graphs, summaries, and downloadable reports.  
- Store raw, cleaned, and processed data in PostgreSQL with a schema that supports products, sources, reviews, aspects, aspect sentiments, aggregated metrics, and evaluation annotations.  

**High-Level System Architecture (Summary)**

At a high level, the system consists of:  
- a **Data Collection Layer** (Node.js + Playwright) that crawls and scrapes reviews with robots.txt and rate limiting compliance,  
- a **Processing & Cleaning Layer** (Python) that parses HTML, detects language, normalizes text, and removes duplicates using sentence-transformer embeddings,  
- an **ABSA / AI Layer** (Python + LLM) that generates embeddings, extracts aspect candidates, and classifies sentiment per aspect to form an aspect–sentiment map,  
- a **Backend API** (FastAPI) that exposes search, summary, and export endpoints,  
- a **Frontend Dashboard** (React + Ant Design + Recharts) that visualizes aspect-level sentiment and example reviews,  
- and a **Data Layer** (PostgreSQL) that stores products, reviews, aspects, sentiments, and evaluation annotations.  

## Folder Structure

- **01_Dokumantasyon**: All project documents  
  - Raporlar: Project reports  
  - Sunumlar: Presentation files  
  - Toplanti_Notlari: Meeting notes  
- **02_Kod**: Source code  
  - Frontend: Frontend application  
  - Backend: Backend application  
  - Veritabani: Database files  
  - Mobil: Mobile application  
  - Testler: Test code  
  - Scriptler: Helper scripts  
- **03_Tasarim**: UI/UX designs  
- **04_Arastirma**: Literature and market research  
- **05_Toplantilar**: Meeting records  
- **06_Yarismalar**: Competition applications (TEKNOFEST, TUBITAK)  
- **07_Medya**: Videos, posters and screenshots  
- **08_Deployment**: Deployment configurations  
- **09_Test**: Test files and reports  
- **10_Yedek**: Backups  

## Technology Stack

- **Programming Languages**: Python, TypeScript / JavaScript (Node.js, React)  
- **Backend**: FastAPI (Python)  
- **Frontend**: React, Ant Design, Recharts  
- **Data Collection**: Node.js, Playwright (ethical web scraping with robots.txt and rate limiting)  
- **NLP / AI**: sentence-transformers (embeddings, duplicate detection), fastText (language detection), LLM API (e.g., gemini-2.5-pro or equivalent) for aspect and sentiment extraction  
- **Database**: PostgreSQL  
- **Tools**: Git, GitHub, virtual environments / Docker (for reproducible development and deployment)  

## Installation

The project consists of three main components (Node.js Backend, Python NLP Service, and React Frontend). To run the project, ensure you have **Node.js**, **Python 3.10+**, and **PostgreSQL** installed.

### 1. PostgreSQL Database Preparation
Ensure PostgreSQL is running on your machine or server, and create an empty database named `ai_reviews`.

### 2. Backend (Node.js) Setup
The Node.js main API server manages comment scraping (Playwright), LLM (Gemini) integration, and database (Prisma) operations.

```bash
cd 02_Kod/Backend
npm install
# Create your .env file and fill in DATABASE_URL and GOOGLE_API_KEY with your own credentials.
npx prisma db push  # Generates the database tables
npm run dev         # Starts the server on http://localhost:3001
```

### 3. Python NLP Service Setup
The FastAPI-based service performs HTML cleaning and text filtering (spam/duplicate detection) using fastText and sentence-transformers.

```bash
cd 02_Kod/Python_NLP
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```
> \*\*Note:\*\* The service might take a moment to respond on its first run as it downloads the `sentence-transformers` model.

### 4. Frontend (React) Setup
The modern web interface (Ant Design & Recharts) where users perform analysis.

```bash
cd 02_Kod/Frontend
npm install
npm run dev         # Starts the UI on http://localhost:5173
```

## Important Dates

- **Midterm Demo**: November 8-16, 2025  
- **Final Demo**: January 3-16, 2026  
- **Beta Release**: March 2026  
- **Production**: June 2026  

Planned phases (Nov 2025 – Jun 2026):

1. **Nov 1–7, 2025: Project Planning & Requirements** – Project scope definition, requirements analysis, use-case specification, and initial architecture sketches.  
2. **Nov 8–16, 2025: Midterm Demo – Initial Scraper & Backend Prototype** – Node.js + Playwright scraper prototype, basic FastAPI backend endpoints, and a minimal UI for demonstrating core idea.  
3. **Nov 17, 2025 – Jan 2, 2026: Cleaning, Duplicate Detection & ABSA Research (Final Demo Preparation)** – Python data cleaning pipeline (BeautifulSoup, fastText, sentence-transformers), near-duplicate detection (target ≥ 90%), and ABSA model research ahead of the final demo.  
4. **Jan 3–16, 2026: Final Demo – ABSA Model (v1) & Basic Dashboard** – Integration of sentence-transformers and an LLM for aspect and sentiment extraction, plus a basic React dashboard to showcase end-to-end functionality.  
5. **Jan 17 – Feb 29, 2026: ABSA Refinement & Evaluation** – Improving model accuracy (target ≥ 80% on an annotated dataset), error analysis, and evaluation with standard metrics (Precision, Recall, F1-Score).  
6. **Mar 2026: Dashboard, Reporting & Beta Release** – Enhancing the dashboard UI/UX, adding reporting and export (JSON/CSV/PDF) functionalities, and releasing a beta version to a limited set of users.  
7. **Apr – May 2026: Optimization, Security & Production Preparation** – Performance optimization, basic security and privacy checks, logging/monitoring improvements, and preparation of production-ready configuration.  
8. **Jun 2026: Production Release & Final Documentation** – Production release, final stabilization, and completion of all required documentation and graduation project materials.  

## License

This project has been developed by **Melih DIVAN** as part of the senior graduation project in the Computer Engineering Department at Recep Tayyip Erdoğan University (RTEU). The code, design, and related content represent the academic work and efforts of the project author and are intended for academic, educational, and evaluation purposes by the relevant faculty members and supervisors.

## Contact

- **Supervisor**: Dr. Ugur CORUH – ugur.coruh@erdogan.edu.tr  
- **Repository**: https://github.com/rteu-ceng/2025-2026-team-5-repo  
