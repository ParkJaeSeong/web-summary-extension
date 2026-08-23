# Chrome Web Store listing draft

## Positioning

**Product name:** PageMind

**One sentence:** A local-first Chrome assistant for chatting with webpages, YouTube videos, and
PDFs with source-linked answers.

**Suggested category:** Productivity

## English listing

### Short description

Chat with webpages, YouTube videos, and PDFs using local memory and source-linked answers.

### Detailed description

PageMind turns the page in your current Chrome tab into a useful conversation. Ask questions about
an article, a YouTube video with accessible captions, or a text-based PDF and follow citations back
to the original paragraph, timestamp, or PDF page.

Your conversations, extracted content, embeddings, and page memory are stored on this device.
PageMind has no account service or cloud sync. When you choose an AI action, only the required
question and source context are sent to the chat or embedding provider you configured.

Key features:

- One Side Panel for webpages, YouTube, and PDFs
- Clickable source citations
- OpenAI, Gemini, Anthropic Claude, and compatible/local providers
- Local page memory and semantic or keyword search
- Configurable retention and per-item data deletion
- Reusable prompt buttons and Markdown export
- English and Korean interface

Automatic embedding of source content is disabled by default. Scanned PDFs requiring OCR and
videos without accessible captions are not supported in the first beta.

## Korean listing

### 짧은 설명

웹페이지, YouTube, PDF와 대화하고 로컬 기억과 출처 링크로 내용을 다시 찾으세요.

### 상세 설명

PageMind는 현재 Chrome 탭의 콘텐츠를 대화형 지식으로 바꿉니다. 웹 문서, 접근 가능한 자막이
있는 YouTube 영상, 텍스트 기반 PDF에 질문하고 답변의 인용을 눌러 원문 문단, 영상 시점, PDF
페이지로 돌아갈 수 있습니다.

대화, 추출 콘텐츠, 임베딩과 페이지 기억은 이 기기에 저장됩니다. PageMind 계정이나 클라우드
동기화 서비스는 없습니다. AI 기능을 실행할 때만 필요한 질문과 출처 컨텍스트를 사용자가 설정한
채팅 또는 임베딩 제공자로 전송합니다.

주요 기능:

- 웹페이지, YouTube, PDF를 위한 하나의 사이드 패널
- 클릭 가능한 출처 인용
- OpenAI, Gemini, Anthropic Claude, 호환/로컬 제공자
- 로컬 페이지 기억과 의미·키워드 검색
- 보관 기간 설정과 항목별 데이터 삭제
- 프롬프트 버튼과 Markdown 내보내기
- 한국어와 영어 인터페이스

콘텐츠 자동 임베딩은 기본적으로 꺼져 있습니다. OCR이 필요한 스캔 PDF와 접근 가능한 자막이 없는
영상은 첫 베타에서 지원하지 않습니다.

## Privacy and single-purpose declarations

**Single purpose:** PageMind lets users converse with and retrieve information from the webpage,
captioned YouTube video, or PDF they intentionally open.

**Data use:** Page content, conversations, embeddings, settings, and page memory are stored locally.
Question/context data is transmitted only to user-configured AI providers when required. PageMind
does not sell data, use it for advertising, or operate analytics/cloud-sync services.

Permission explanations are maintained in [PERMISSIONS.md](PERMISSIONS.md). The publishable privacy
policy text is maintained in [../PRIVACY.md](../PRIVACY.md).

## Required assets

Chrome's official listing guidance currently calls for:

- Packaged icon: 128×128 px; for a square icon, 96×96 artwork with 16 px transparent padding
- At least one screenshot and up to five: preferably 1280×800 px, alternatively 640×400 px
- Required small promotional tile: 440×280 px PNG or JPEG
- Optional marquee promotional tile: 1400×560 px PNG or JPEG

Recommended screenshot set:

1. Webpage question with paragraph citation
2. YouTube answer with timestamp citation
3. PDF answer with page citation
4. Local page-memory search
5. Provider, privacy, and local-data settings

Promotional art should avoid text where possible because it cannot be localized. See Chrome's
[listing fields](https://developer.chrome.com/docs/webstore/cws-dashboard-listing) and
[official image guidance](https://developer.chrome.com/docs/webstore/images).

## External items still required

- Capture the five screenshots from the final installed beta build.
- Produce the 440×280 tile and optional 1400×560 marquee artwork.
- Publish `PRIVACY.md` at a stable HTTPS URL.
- Choose and publish a support URL or support email.
- Optionally record a YouTube product video.
