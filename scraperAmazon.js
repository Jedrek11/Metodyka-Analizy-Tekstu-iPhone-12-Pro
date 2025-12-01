const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const readline = require('readline');
const path = require('path');

puppeteer.use(StealthPlugin());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForUser = async () => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question('\n---> [CZEKAM] Upewnij się, że widzisz listę opinii i naciśnij ENTER... ', (ans) => {
            rl.close();
            resolve(ans);
        });
    });
};

const scrapeAndSaveFiles = async () => {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized', '--no-sandbox']
    });

    const page = await browser.newPage();
    

    const startUrl = 'https://www.amazon.com/product-reviews/B08PMYLKVF/ref=cm_cr_dp_d_show_all_btm?ie=UTF8&reviewerType=all_reviews'; // iPhone 12 Pro Pacyfic Blue 128GB
    
    const targetReviewCount = 100; 
    const outputFolder = path.join('reviews', 'en'); 

    if (!fs.existsSync(outputFolder)){
        fs.mkdirSync(outputFolder, { recursive: true });
    }

    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    try {
        console.log('--- Otwieram stronę (tylko język angielski)... ---');
        await page.goto(startUrl, { waitUntil: 'domcontentloaded' });

        console.log("\n==================================================");
        console.log(" 🛑 INSTRUKCJA MANUALNA:");
        console.log(" 1. Rozwiąż CAPTCHA, jeśli się pojawi.");
        console.log(" 2. Upewnij się, że widzisz listę opinii.");
        console.log(" 3. Sprawdź, czy w filtrach wybrane jest 'English only'.");
        console.log(" 4. WRÓĆ TUTAJ i naciśnij ENTER.");
        console.log("==================================================");

        await waitForUser();

        console.log(`✅ Rozpoczynam pobieranie. Pliki trafią do folderu: ${outputFolder}`);

        let collectedData = [];
        
        while (collectedData.length < targetReviewCount) {
            console.log(`Pobrano: ${collectedData.length}/${targetReviewCount}`);

            try {
                await page.waitForSelector('[data-hook="review"]', { timeout: 5000 });
            } catch (e) {
                console.log('⚠️ Brak opinii na stronie. Koniec lub błąd.');
                break;
            }

            const pageReviews = await page.evaluate(() => {
                const rows = [];
                let productRaw = "Unknown_Product";
                const productLink = document.querySelector('a[data-hook="product-link"]');
                if (productLink) {
                    productRaw = productLink.innerText.trim()
                        .replace(/[^a-zA-Z0-9 ]/g, "") 
                        .replace(/\s+/g, "_")          
                        .substring(0, 30);             
                }

                const cards = document.querySelectorAll('[data-hook="review"]');

                cards.forEach(card => {
                    const contentEl = card.querySelector('[data-hook="review-body"] span');
                    const ratingEl = card.querySelector('[data-hook="review-star-rating"] .a-icon-alt'); 

                    if (contentEl && ratingEl) {
                        const rawRatingText = ratingEl.innerText.trim(); 
                        let stars = 0;
                        try {
                            stars = parseFloat(rawRatingText.split(' ')[0]);
                        } catch (err) {}
                        
                        const normalizedScore = (stars / 5).toFixed(3);
                        const sentiment = stars >= 2.5 ? "P" : "N";
                        const content = contentEl.innerText.trim();

                        rows.push({
                            productName: productRaw,
                            score: normalizedScore, 
                            sentiment: sentiment,   
                            content: content
                        });
                    }
                });
                return rows;
            });

            collectedData = [...collectedData, ...pageReviews];

            if (collectedData.length >= targetReviewCount) break;

            const nextBtn = await page.$('li.a-last a');
            if (!nextBtn) {
                console.log("Koniec stron.");
                break;
            }
            
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle2' }),
                nextBtn.click(),
            ]);
            await sleep(2000 + Math.random() * 2000);
        }

        console.log("--- Zapisywanie plików... ---");
        
        if (collectedData.length > 0) {
            collectedData.forEach((r, index) => {
                const fileName = `${r.productName}_${r.score}_${r.sentiment}_${index + 1}.txt`;
                const filePath = path.join(outputFolder, fileName);
                fs.writeFileSync(filePath, r.content, { encoding: 'utf8' });
            });
            console.log(`\nSUKCES! Utworzono ${collectedData.length} plików w folderze '${outputFolder}'.`);
        } else {
            console.log("Brak danych do zapisania.");
        }

    } catch (err) {
        console.error("Błąd:", err);
    } finally {
        await browser.close();
    }
};

scrapeAndSaveFiles();
