const CACHE_NAME = 'duty_calc-v4';
const OFFLINE_URL = './index.html'; // 오프라인 시 보여줄 기본 페이지
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon.png'
];
const TIMEOUT_DURATION = 3000; 

// ⏱️ 타임아웃이 적용된 커스텀 fetch
const fetchWithTimeout = async (request, timeout) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error; 
  }
};

// 1. 앱 설치 시 파일들을 기기에 저장(캐시)
self.addEventListener('install', event => {
  self.skipWaiting(); // 새 버전 즉시 활성화
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// 2. 앱 업데이트 시 구버전 찌꺼기 완벽 삭제
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // 즉시 클라이언트 제어권 확보
});

// 3. 완벽한 Cache First 전략 & 가짜 와이파이 방어
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 🚀 예외 처리: POST 요청 등 브라우저가 캐시할 수 없는 통신은 무조건 네트워크만 사용
  if (event.request.method !== 'GET') {
    event.respondWith(
      fetchWithTimeout(event.request, 5000).catch(() => {
        return new Response(JSON.stringify({ result: "error", msg: "오프라인 상태입니다." }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // 🛡️ 기본 로직 (async/await 구조로 가독성 및 안정성 강화)
  event.respondWith(
    (async () => {
      // 1. 캐시 확인 (있으면 즉시 반환)
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }

      // 2. 캐시에 없으면 네트워크 요청 시도 (타임아웃 적용)
      try {
        const networkResponse = await fetchWithTimeout(event.request, TIMEOUT_DURATION);
        
        // 💡 추가된 핵심: 유효한 정상 자원(200 OK)만 캐시에 동적으로 저장 (캐시 오염 방지)
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone());
        }
        
        return networkResponse;
      } catch (error) {
        // 3. 네트워크 실패 (오프라인, 가짜 와이파이 등) 시의 폴백(Fallback) 처리
        if (event.request.mode === 'navigate') {
          return await caches.match(OFFLINE_URL); 
        }
        
        return new Response('오프라인 상태이거나 자원을 찾을 수 없습니다.', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      }
    })()
  );
});
