import express, { Request, Response } from 'express';
import cors from 'cors';
import { chromium, Page } from 'playwright';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

interface ScrapeResult {
    images: string[];
    videos: string[];
    audios: string[];
}

app.post('/scrape', async (req: Request, res: Response): Promise<void> => {
    const { url } = req.body;

    if (!url) {
        res.status(400).json({ error: 'URL is required' });
        return;
    }

    let browser;
    try {
        browser = await chromium.launch({ headless: true,  args: ["--no-sandbox", "--disable-setuid-sandbox"] });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 720 }
        });
        const page = await context.newPage();

        const interceptedMedia: { images: Set<string>, videos: Set<string>, audios: Set<string> } = {
            images: new Set(),
            videos: new Set(),
            audios: new Set()
        };

        // Network sniffing to catch media loaded via XHR/Fetch/Tags
        page.on('response', (response) => {
            const url = response.url();
            const headers = response.headers();
            const contentType = headers['content-type'] || '';
            const resourceType = response.request().resourceType();

            // Filter out obviously non-media types to reduce noise
            if (url.startsWith('data:') || resourceType === 'font' || resourceType === 'stylesheet' || resourceType === 'script') return;

            // Regex allows query parameters (remove $ anchor)
            const isMediaExtension = url.match(/\.(mp4|webm|m3u8|mp3|wav|ogg|mov|flv|avi|ts)(\?|$)/i);
            const isImageExtension = url.match(/\.(jpeg|jpg|gif|png|webp|svg)(\?|$)/i);

            // Broad search for video/audio content types
            const isVideoType = contentType.includes('video') || contentType.includes('mpegurl') || contentType.includes('dash+xml') || contentType.includes('octet-stream'); // Octet stream sometimes used for direct DL
            const isAudioType = contentType.includes('audio');

            if (resourceType === 'image' || contentType.startsWith('image/')) {
                if (isImageExtension || contentType.includes('image')) {
                    interceptedMedia.images.add(url);
                }
            } else if (resourceType === 'media' || isVideoType || isAudioType || isMediaExtension) {
                // Refined Heuristic
                if (isAudioType || (isMediaExtension && url.match(/\.(mp3|wav|ogg)(\?|$)/i))) {
                    interceptedMedia.audios.add(url);
                } else {
                    // Default to video if unsure (e.g. octet-stream with mp4 extension, or m3u8)
                    // Check extension if generic content-type
                    if (contentType.includes('octet-stream') && !isMediaExtension) {
                        return; // Ignore octet-stream if no media extension
                    }
                    interceptedMedia.videos.add(url);
                }
            }
        });

        console.log(`Navigating to ${url}...`);

        // Use 'load' instead of 'domcontentloaded' for better stability
        await page.goto(url, { waitUntil: 'load', timeout: 60000 });

        // Wait for network to be somewhat idle to catch media loaded via JS
        try {
            await page.waitForLoadState('networkidle', { timeout: 10000 });
        } catch (e) {
            console.log('Network did not reach idle state within 10s, proceeding anyway.');
        }

        // Auto-scroll to trigger lazy loading
        const autoScroll = async (p: Page) => {
            await p.evaluate(async () => {
                await new Promise<void>((resolve) => {
                    let totalHeight = 0;
                    const distance = 100;
                    const timer = setInterval(() => {
                        const scrollHeight = document.body.scrollHeight;
                        window.scrollBy(0, distance);
                        totalHeight += distance;
                        if (totalHeight >= scrollHeight || totalHeight > 10000) {
                            clearInterval(timer);
                            resolve();
                        }
                    }, 100);
                });
            });
        };

        try {
            await autoScroll(page);
        } catch (error: any) {
            console.log('Scroll error (possible navigation):', error.message);
            await page.waitForLoadState('load', { timeout: 5000 }).catch(() => { });
        }

        const scrapeMedia = async (p: Page): Promise<ScrapeResult> => {
            return await p.evaluate(() => {
                const getSrc = (elements: NodeListOf<HTMLElement>, attribute: string) => {
                    return Array.from(elements)
                        .map(el => (el as any)[attribute])
                        .filter(src => src && src.trim() !== '')
                    // remove duplicates later
                };

                // Enhanced check for lazy-loaded images (data-src, etc.)
                const images = Array.from(document.querySelectorAll('img'))
                    .map(img => img.src || img.getAttribute('data-src') || img.getAttribute('data-original'))
                    .filter(src => src);

                const videos = Array.from(document.querySelectorAll('video'))
                    .map(video => video.src || video.currentSrc)
                    .filter(src => src);

                // Also check for source tags inside video
                document.querySelectorAll('video source').forEach(source => {
                    if ((source as HTMLSourceElement).src) videos.push((source as HTMLSourceElement).src);
                });

                // Check for simple links to video files
                document.querySelectorAll('a[href$=".mp4"], a[href$=".mov"], a[href$=".webm"]').forEach(link => {
                    if ((link as HTMLAnchorElement).href) videos.push((link as HTMLAnchorElement).href);
                });

                const audios = Array.from(document.querySelectorAll('audio')).map(audio => audio.src || audio.currentSrc).filter(src => src);
                document.querySelectorAll('audio source').forEach(source => {
                    if ((source as HTMLSourceElement).src) audios.push((source as HTMLSourceElement).src);
                });

                return {
                    images: images as string[],
                    videos: videos as string[],
                    audios: audios as string[]
                };
            });
        };

        let media: ScrapeResult = { images: [], videos: [], audios: [] };
        try {
            media = await scrapeMedia(page);
        } catch (error: any) {
            console.log('Final scrape error, retrying once:', error.message);
            await page.waitForLoadState('load', { timeout: 5000 }).catch(() => { });
            try {
                media = await scrapeMedia(page);
            } catch (innerError) {
                console.error('Final scrape failed after retry:', innerError);
            }
        }

        // Deduplicate and process URLs
        const processUrls = (urls: string[]) => {
            return [...new Set(urls)].filter(u => u.startsWith('http'));
        }

        const result = {
            images: [...new Set([...processUrls(media.images), ...processUrls(Array.from(interceptedMedia.images))])],
            videos: [...new Set([...processUrls(media.videos), ...processUrls(Array.from(interceptedMedia.videos))])],
            audios: [...new Set([...processUrls(media.audios), ...processUrls(Array.from(interceptedMedia.audios))])]
        };

        res.json(result);

    } catch (error: any) {
        console.error('Scraping error:', error);
        res.status(500).json({ error: 'Failed to scrape the URL', details: error.message });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on :${PORT}`);
});
