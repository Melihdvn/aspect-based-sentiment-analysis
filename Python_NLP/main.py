from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
from processor import clean_html, normalize_text, detect_language, load_models, remove_duplicates

app = FastAPI(title="NLP Preprocessing Service")

class ReviewInput(BaseModel):
    text: str
    id: Optional[str] = None

class PreprocessRequest(BaseModel):
    reviews: List[ReviewInput]
    target_lang: str = "tr"  # Yalnızca bu dili tut
    similarity_threshold: float = 0.90 # Benzerlik sınırı

class ProcessedReview(BaseModel):
    original_text: str
    cleaned_text: str
    language: str
    id: Optional[str] = None

class PreprocessResponse(BaseModel):
    original_count: int
    processed_count: int
    unique_count: int
    results: List[ProcessedReview]

@app.on_event("startup")
def on_startup():
    print("Modeller önbelleğe alınıyor...")
    load_models()
    print("Modeller hazır.")

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "Python NLP Preprocessing"}

@app.post("/api/preprocess", response_model=PreprocessResponse)
def preprocess_reviews(payload: PreprocessRequest):
    try:
        results = []
        valid_texts_for_dedup = []
        valid_inputs = []
        
        # 1. HTML temizleme, normalizasyon ve dil filtresi
        for review in payload.reviews:
            if not review.text.strip():
                continue
                
            cleaned = normalize_text(review.text)
            lang = detect_language(cleaned)
            
            # Dil uyuşmazlığını atla
            if payload.target_lang and lang != payload.target_lang:
                continue
                
            valid_inputs.append(review)
            valid_texts_for_dedup.append(cleaned)
            
        # 2. Kopya/Benzer yorum ayıklama (De-duplication)
        unique_cleaned_texts = remove_duplicates(valid_texts_for_dedup, threshold=payload.similarity_threshold)
        
        # Orijinal ID'leri korumak için eşleştir
        # remove_duplicates sadece benzersiz stringleri döndüğü için, 
        # ilk geçerli indexlerle eşleştirmek daha sağlam olabilir, ama şimdilik metin eşleşmesi yapıyoruz.
        unique_set = set(unique_cleaned_texts)
        
        final_results = []
        seen = set()
        
        for review, cleaned in zip(valid_inputs, valid_texts_for_dedup):
            # Eğer bu metin unique listesindeyse ve henüz eklenmediyse al
            if cleaned in unique_set and cleaned not in seen:
                seen.add(cleaned)
                final_results.append(
                    ProcessedReview(
                        original_text=review.text,
                        cleaned_text=cleaned,
                        language=payload.target_lang,
                        id=review.id
                    )
                )

        return PreprocessResponse(
            original_count=len(payload.reviews),
            processed_count=len(valid_inputs),
            unique_count=len(final_results),
            results=final_results
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
