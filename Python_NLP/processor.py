import os
import urllib.request
from bs4 import BeautifulSoup
import fasttext
from sentence_transformers import SentenceTransformer, util
import re

# FastText model file
FT_MODEL_PATH = "lid.176.ftz"
FT_MODEL_URL = "https://dl.fbaipublicfiles.com/fasttext/supervised-models/lid.176.ftz"

_ft_model = None
_st_model = None

def load_models():
    """Modelleri tembel yollarla yükler (Lazy load)."""
    global _ft_model, _st_model
    
    # Load fastText
    if _ft_model is None:
        if not os.path.exists(FT_MODEL_PATH):
            print(f"[{__name__}] downloading {FT_MODEL_PATH}...")
            urllib.request.urlretrieve(FT_MODEL_URL, FT_MODEL_PATH)
        _ft_model = fasttext.load_model(FT_MODEL_PATH)
        
    # Load sentence-transformers
    if _st_model is None:
        # Using a lightweight multilingual model that supports Turkish
        _st_model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
        
def clean_html(text: str) -> str:
    """HTML etiketlerini temizler."""
    if not text:
        return ""
    soup = BeautifulSoup(text, "html.parser")
    return soup.get_text(separator=" ")

def normalize_text(text: str) -> str:
    """Metin normalizasyonu (küçük harf, fazladan boşluk temizleme vs.)."""
    text = clean_html(text)
    # Temel normalizasyon: boşlukları temizle. Türkçe küçük harfe çevirme
    text = text.replace('I', 'ı').replace('İ', 'i').lower()
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def detect_language(text: str) -> str:
    """fastText ile dilini tespit eder. (örn. 'tr', 'en')"""
    load_models()
    # fastText expects text without newlines
    clean_t = text.replace('\n', ' ').strip()
    if not clean_t:
        return "unknown"
    
    predictions = _ft_model.predict(clean_t, k=1)
    label = predictions[0][0] # e.g. '__label__tr'
    lang = label.replace("__label__", "")
    return lang

def remove_duplicates(reviews: list[str], threshold: float = 0.90) -> list[str]:
    """sentence-transformers ile algısal (semantic) olarak yinelenen (çok benzer) yorumları filtreler.
       Geriye benzersiz yorumların listesini döner."""
    if not reviews:
        return []
    
    load_models()
    
    # Önce metinleri normalize et
    normalized_reviews = [normalize_text(r) for r in reviews]
    
    # Boş metinleri ele
    valid_indices = [i for i, r in enumerate(normalized_reviews) if len(r) > 5]
    if not valid_indices:
        return reviews # Eğer hepsi çok kısaysa orjinali dön.
        
    valid_texts = [normalized_reviews[i] for i in valid_indices]
    
    # Gömlemeleri (embeddings) oluştur
    embeddings = _st_model.encode(valid_texts, convert_to_tensor=True)
    
    # Kosinüs benzerlik matrisi hesapla
    cosine_scores = util.cos_sim(embeddings, embeddings)
    
    keep_indices = []
    dropped_indices = set()
    
    for i in range(len(valid_texts)):
        if i in dropped_indices:
            continue
        keep_indices.append(valid_indices[i])
        for j in range(i + 1, len(valid_texts)):
            if cosine_scores[i][j].item() > threshold:
                dropped_indices.add(j)
                
    # keep_indices içindeki orijinal metinleri topla
    # Kısa metin olanlar (valid_indices içinde olmayanlar) direkt eklenebilir veya silinebilir, 
    # mantıken spam kabul edilip silinmesi iyidir, ama biz şimdilik uzun ve benzersiz olanları alalım.
    unique_reviews = [reviews[idx] for idx in keep_indices]
    return unique_reviews
