# 2025-2026-team-5-repo

## Takım Bilgileri

### Takım 5

- **Takım Lideri**: Melih DIVAN (221401020)

## Danışman

- **Dr. Uğur CORUH** – ugur.coruh@erdogan.edu.tr

## Proje Hakkında

Bu projenin amacı, birden fazla e-ticaret platformu ve forumdan (Türkiye'nin önde gelen e-ticaret siteleri vb.) kullanıcı yorumlarını etik ve mevzuata uygun bir şekilde toplayan ve bu yorumlar üzerinde özellik bazlı duygu analizi (Aspect-Based Sentiment Analysis, ABSA) yapan yapay zeka destekli bir yorum analiz ve içgörü platformu geliştirmektir.

Sistemin amacı, bir ürüne yalnızca tek bir genel duygu skoru atamak yerine, ürün düzeyinde ince taneli özellikleri (örneğin; batarya ömrü, ekran kalitesi, performans, müşteri hizmetleri) otomatik olarak çıkarmak ve her bir özellik için duyguyu ayrı ayrı belirlemektir (pozitif, negatif, nötr). Çoklu kaynaklı veri füzyonu, BERT tabanlı cümle dönüştürücü (sentence-transformer) gömlemeleri ve büyük dil modellerini (LLM’ler) kullanarak, platform ürünlerin güçlü ve zayıf yönlerini ortaya çıkarmayı, bunları bir özellik–duygu haritasında toplamayı ve sonuçları kullanıcıya etkileşimli panolar (dashboard) ve indirilebilir raporlar aracılığıyla sunmayı hedefler.

Bu konu, öğrencinin TÜBİTAK 2209-B sanayiye yönelik araştırma önerisi ile lisans bitirme projesi arasında ortak bir tema olarak seçilmiştir; ancak bu depo öncelikli olarak **lisans bitirme projesi** olarak yapılandırılmıştır ve Bilgisayar Mühendisliği bitirme tezi kapsamında uygulanıp değerlendirilecektir.

**Proje Hedefleri**

- Birden fazla e-ticaret platformu ve forumdan kullanıcı yorumlarını, robots.txt, istek sınırlandırma (rate limiting) ve platform politikalarına tam uyumlu şekilde toplamak.  
- Yinelenen, spam ve bozuk metinleri temizleyen bir veri temizleme ve normalizasyon hattı tasarlamak.  
- BERT tabanlı sentence-transformer gömlemeleri ve bir LLM (örn. gemini-2.5-pro veya muadili) kullanarak, özellikleri ve bu özelliklere ait duyguyu en az %80 doğrulukla tespit eden bir özellik bazlı duygu analizi hattı inşa etmek.  
- Özellik bazlı duygu dağılımlarını görselleştiren ve temsil edici yorum alıntılarını öne çıkaran kullanıcı dostu bir pano (web arayüzü) geliştirmek.  
- Sistem performansını Precision, Recall, F1-Score gibi metrikler ve kullanıcı memnuniyeti anketleri ile değerlendirmek.  

**Projenin Kapsamı**

- Node.js ve Playwright kullanarak, robots.txt ve istek sınırlandırma kurallarına saygı duyan etik bir veri toplama katmanı (scraper) geliştirmek.  
- BeautifulSoup, fastText ve sentence-transformers kullanan; HTML ayrıştırma, dil tespiti, normalizasyon ve yinelenen/benzer yorumların filtrelenmesi işlevlerini içeren Python tabanlı bir ön işleme hattı uygulamak.  
- sentence-transformer gömlemeleri ve bir LLM kullanan, özellik çıkarımı ve her bir özellik için duygu sınıflandırması (pozitif, negatif, nötr) yapan bir ABSA hattı tasarlamak ve uygulamak.  
- Ürün arama, özetler ve dışa aktarım (JSON/CSV/PDF) uç noktalarını sağlayan FastAPI tabanlı backend servislerini geliştirmek.  
- Grafikler, özetler ve indirilebilir raporlar sunan, Ant Design ve Recharts kullanan React tabanlı bir frontend arayüzü geliştirmek.  
- ham, temizlenmiş ve işlenmiş veriyi; ürünler, kaynaklar, yorumlar, özellikler, özellik duygu etiketleri, özet metrikler ve değerlendirme anotasyonlarını destekleyen bir şema ile PostgreSQL üzerinde saklamak.  

**Yüksek Seviyeli Sistem Mimarisi (Özet)**

Yüksek seviyede sistem şu bileşenlerden oluşur:  
- yorumları robots.txt ve istek sınırlandırma kurallarına uyarak tarayan ve toplayan bir **Veri Toplama Katmanı** (Node.js + Playwright),  
- HTML ayrıştırma, dil tespiti, metin normalizasyonu ve sentence-transformer gömlemeleriyle tekrarların temizlenmesini yapan bir **İşleme ve Temizleme Katmanı** (Python),  
- gömlemeleri üreten, özellik adaylarını çıkaran ve her bir özellik için duygu sınıflandırması yaparak bir özellik–duygu haritası oluşturan bir **ABSA / Yapay Zeka Katmanı** (Python + LLM),  
- arama, özet ve dışa aktarım uç noktalarını sunan bir **Backend API** (FastAPI),  
- özellik bazlı duygu dağılımlarını ve örnek yorumları görselleştiren bir **Ön Yüz Panosu** (React + Ant Design + Recharts),  
- ve ürünler, yorumlar, özellikler, duygu etiketleri ve değerlendirme anotasyonlarını saklayan bir **Veri Katmanı** (PostgreSQL).  

## Klasör Yapısı

- **01_Dokumantasyon**: Tüm proje dokümanları  
  - Raporlar: Proje raporları  
  - Sunumlar: Sunum dosyaları  
  - Toplanti_Notlari: Toplantı notları  
- **02_Kod**: Kaynak kod  
  - Onyz: Ön yüz (frontend) uygulaması  
  - Arkayz: Arka yüz (backend) uygulaması  
  - Veritabani: Veritabanı dosyaları  
  - Mobil: Mobil uygulama  
  - Testler: Test kodu  
  - Scriptler: Yardımcı betikler  
- **03_Tasarim**: UI/UX tasarımları  
- **04_Arastirma**: Literatür ve pazar araştırması  
- **05_Toplantilar**: Toplantı kayıtları  
- **06_Yarismalar**: Yarışma başvuruları (TEKNOFEST, TÜBİTAK)  
- **07_Medya**: Videolar, afişler ve ekran görüntüleri  
- **08_Deployment**: Dağıtım (deployment) konfigürasyonları  
- **09_Test**: Test dosyaları ve raporlar  
- **10_Yedek**: Yedekler  

## Teknoloji Yığını

- **Programlama Dilleri**: Python, TypeScript / JavaScript (Node.js, React)  
- **Backend**: FastAPI (Python)  
- **Frontend**: React, Ant Design, Recharts  
- **Veri Toplama**: Node.js, Playwright (robots.txt ve istek sınırlandırmaya uyan etik web scraping)  
- **NLP / Yapay Zeka**: sentence-transformers (gömlemeler, tekrar tespiti), fastText (dil tespiti), LLM API (örn. gemini-2.5-pro veya muadili) ile özellik ve duygu çıkarımı  
- **Veritabanı**: PostgreSQL  
- **Araçlar**: Git, GitHub, sanal ortamlar / Docker (tekrarlanabilir geliştirme ve dağıtım için)  

## Kurulum

Proje üç ana bileşenden (Node.js Backend, Python NLP Servisi ve React Frontend) oluşmaktadır. Çalıştırmak için ortamınızda **Node.js**, **Python 3.10+** ve **PostgreSQL** kurulu olmalıdır.

### 1. PostgreSQL Veritabanı Hazırlığı
Bilgisayarınızda veya sunucunuzda PostgreSQL'in çalıştığından emin olun ve `ai_reviews` adında boş bir veritabanı oluşturun.

### 2. Backend (Node.js) Kurulumu
Node.js tabanlı ana API sunucusu yorum çekme (Playwright), LLM (Gemini) entegrasyonu ve veritabanı (Prisma) kayıt işlemlerini yönetir.

```bash
cd 02_Kod/Backend
npm install
# .env dosyanızı oluşturun ve içindeki DATABASE_URL ve GOOGLE_API_KEY değerlerini kendi bilgilerinize göre doldurun.
npx prisma db push  # Veritabanı tablolarını oluşturur
npm run dev         # Sunucuyu http://localhost:3001 portunda başlatır
```

### 3. Python NLP Servisi Kurulumu
FastAPI tabanlı servis, HTML temizliği ve fastText/sentence-transformers ile metin filtrelemesi (spam/tekrar tespiti) yapar.

```bash
cd 02_Kod/Python_NLP
python -m venv .venv
source .venv/bin/activate  # Windows için: .venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```
> \*\*Not:\*\* İlk çalıştırmada `sentence-transformers` modeli indirileceği için servis biraz geç yanıt verebilir.

### 4. Frontend (React) Kurulumu
Kullanıcıların analiz yapacağı modern (Ant Design & Recharts) web arayüzüdür.

```bash
cd 02_Kod/Frontend
npm install
npm run dev         # Arayüzü http://localhost:5173 portunda başlatır
```

## Önemli Tarihler

- **Ara Sunum (Midterm Demo)**: 8–16 Kasım 2025  
- **Final Sunum (Final Demo)**: 3–16 Ocak 2026  
- **Beta Sürümü**: Mart 2026  
- **Üretim (Production)**: Haziran 2026  

Planlanan fazlar (Kasım 2025 – Haziran 2026):

1. **1–7 Kasım 2025: Proje Planlama ve Gereksinimler** – Proje kapsamının netleştirilmesi, gereksinim analizi, kullanım senaryolarının belirlenmesi ve ilk mimari taslakların hazırlanması.  
2. **8–16 Kasım 2025: Ara Sunum – İlk Scraper ve Backend Prototipi** – Node.js + Playwright scraper prototipi, temel FastAPI backend uç noktaları ve çekirdek fikri gösterecek basit bir arayüz ile ara sunumun yapılması.  
3. **17 Kasım 2025 – 2 Ocak 2026: Temizleme, Tekrar Tespiti ve ABSA Araştırması (Final Sunum Hazırlığı)** – Python veri temizleme hattı (BeautifulSoup, fastText, sentence-transformers), benzer/yineleyen yorum tespiti (hedef ≥ %90) ve final sunuma yönelik ABSA model araştırmaları.  
4. **3–16 Ocak 2026: Final Sunum – ABSA Modeli (v1) ve Temel Dashboard** – sentence-transformers ve bir LLM ile özellik ve duygu çıkarımının entegrasyonu ve uçtan uca akışı gösterecek temel React dashboard’unun sunulması.  
5. **17 Ocak – 29 Şubat 2026: ABSA İyileştirme ve Değerlendirme** – Model doğruluğunun artırılması (elle etiketlenmiş veri kümesinde hedef ≥ %80), hata analizleri ve Precision, Recall, F1-Score gibi metriklerle değerlendirme.  
6. **Mart 2026: Dashboard, Raporlama ve Beta Sürümü** – Dashboard UI/UX iyileştirmeleri, raporlama ve dışa aktarma (JSON/CSV/PDF) özelliklerinin eklenmesi ve sınırlı kullanıcı grubuna Beta sürümünün sunulması.  
7. **Nisan – Mayıs 2026: Optimizasyon, Güvenlik ve Üretim Hazırlığı** – Performans optimizasyonu, temel güvenlik ve gizlilik kontrolleri, loglama/izleme iyileştirmeleri ve üretime hazır konfigürasyonun hazırlanması.  
8. **Haziran 2026: Üretim Sürümü ve Son Dokümantasyon** – Üretim sürümünün yayınlanması, son stabilizasyonların yapılması ve gerekli tüm dokümantasyon ile bitirme projesi çıktılarının tamamlanması.  

## Lisans

Bu proje, Recep Tayyip Erdoğan Üniversitesi (RTEÜ) Bilgisayar Mühendisliği Bölümü lisans bitirme projesi kapsamında **Melih DIVAN** tarafından geliştirilmiştir. Kod, tasarım ve ilgili içerikler proje yazarının akademik çalışmasını ve emeğini temsil eder; yalnızca ilgili akademik danışman ve öğretim üyeleri tarafından eğitim ve değerlendirme amaçlı kullanılmak üzere paylaşılmaktadır.

## İletişim

- **Danışman**: Dr. Uğur CORUH – ugur.coruh@erdogan.edu.tr  
- **Depo**: https://github.com/rteu-ceng/2025-2026-team-5-repo  
