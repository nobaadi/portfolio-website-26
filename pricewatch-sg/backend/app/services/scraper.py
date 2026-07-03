"""
Price data layer.

SingStat publishes aggregate CPI by broad category but no Singapore supermarket
(FairPrice, Cold Storage, Sheng Siong) exposes a public price API. Real-time
per-item scraping requires Playwright with rotating proxies to avoid rate limits.

This module provides two implementations behind the same ScrapedPrice interface:

  SimulatedSupermarketScraper  -- base prices anchored to real SingStat CPI
                                   benchmarks with small Gaussian noise
                                   (std ~1.2% of base for grocery items,
                                   ~4% for hawker meals which vary more).
                                   Used in the current deployment.

  HawkerPriceScraper           -- same approach for hawker centre meal prices.

To replace with real data: subclass or swap out the .fetch() method.
The ScrapedPrice dataclass is the interface contract -- the rest of the
pipeline (scheduler, API layer) does not change.
"""
import httpx
import logging
from datetime import datetime, timezone
from typing import List, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

DATA_GOV_BASE = "https://data.gov.sg/api/action/datastore_search"


@dataclass
class ScrapedPrice:
    item_name: str
    category: str
    price_sgd: float
    unit: str
    source: str
    source_url: Optional[str] = None
    scraped_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class SimulatedSupermarketScraper:
    ITEMS = [
        {"name": "FairPrice White Rice 5kg",    "category": "grains",     "base": 8.55,  "unit": "per 5kg bag",       "source": "FairPrice"},
        {"name": "Hen Eggs (per 10)",            "category": "protein",    "base": 3.38,  "unit": "per 10 eggs",      "source": "FairPrice"},
        {"name": "Chicken Breast (per kg)",      "category": "protein",    "base": 9.80,  "unit": "per kg",           "source": "FairPrice"},
        {"name": "Spinach (per 300g)",           "category": "vegetables", "base": 1.55,  "unit": "per 300g",         "source": "FairPrice"},
        {"name": "Full Cream Milk 1L",           "category": "dairy",      "base": 4.25,  "unit": "per litre",        "source": "Cold Storage"},
        {"name": "Whole Chicken (per kg)",       "category": "protein",    "base": 7.20,  "unit": "per kg",           "source": "FairPrice"},
        {"name": "Cabbage (per kg)",             "category": "vegetables", "base": 2.15,  "unit": "per kg",           "source": "FairPrice"},
        {"name": "Tau Kwa Tofu (per 300g)",      "category": "protein",    "base": 1.22,  "unit": "per 300g",         "source": "FairPrice"},
        {"name": "Jasmine Rice 10kg",            "category": "grains",     "base": 17.10, "unit": "per 10kg bag",     "source": "FairPrice"},
        {"name": "Broccoli (per kg)",            "category": "vegetables", "base": 3.90,  "unit": "per kg",           "source": "Cold Storage"},
        {"name": "Pork Belly (per kg)",          "category": "protein",    "base": 14.55, "unit": "per kg",           "source": "FairPrice"},
        {"name": "Banana (per kg)",              "category": "fruits",     "base": 2.85,  "unit": "per kg",           "source": "FairPrice"},
        {"name": "Kangkong (per 300g)",          "category": "vegetables", "base": 1.22,  "unit": "per 300g",         "source": "FairPrice"},
        # Dairy (expanded)
        {"name": "Marigold Low Fat Yogurt 135g", "category": "dairy",      "base": 1.38,  "unit": "per 135g cup",     "source": "FairPrice"},
        {"name": "Anchor Unsalted Butter 250g",  "category": "dairy",      "base": 7.20,  "unit": "per 250g block",   "source": "FairPrice"},
        {"name": "Condensed Milk 390g",          "category": "dairy",      "base": 1.85,  "unit": "per 390g tin",     "source": "FairPrice"},
        # Fruits (expanded)
        {"name": "Papaya (per kg)",              "category": "fruits",     "base": 3.10,  "unit": "per kg",           "source": "FairPrice"},
        {"name": "Fuji Apple (per kg)",          "category": "fruits",     "base": 5.00,  "unit": "per kg",           "source": "FairPrice"},
        {"name": "Navel Orange (per kg)",        "category": "fruits",     "base": 4.60,  "unit": "per kg",           "source": "FairPrice"},
        # Grains (expanded)
        {"name": "Gardenia Bread 400g",          "category": "grains",     "base": 2.95,  "unit": "per 400g loaf",    "source": "FairPrice"},
        {"name": "Maggi Instant Noodles 5pk",    "category": "grains",     "base": 2.10,  "unit": "per 5-pack",       "source": "FairPrice"},
        # Beverages (packaged)
        {"name": "Milo 1kg Tin",                 "category": "beverages",  "base": 11.50, "unit": "per 1kg tin",      "source": "FairPrice"},
        {"name": "100Plus 1.5L",                 "category": "beverages",  "base": 3.00,  "unit": "per 1.5L bottle",  "source": "FairPrice"},
        {"name": "Mineral Water 1.5L",           "category": "beverages",  "base": 0.80,  "unit": "per 1.5L bottle",  "source": "FairPrice"},
    ]

    def fetch(self) -> List[ScrapedPrice]:
        import random
        results = []
        for item in self.ITEMS:
            noise = random.gauss(0, item["base"] * 0.012)
            price = round(max(item["base"] * 0.7, item["base"] + noise), 2)
            results.append(ScrapedPrice(
                item_name=item["name"], category=item["category"],
                price_sgd=price, unit=item["unit"], source=item["source"],
            ))
        return results


class HawkerPriceScraper:
    MEALS = [
        {"name": "Chicken Rice (Hawker)",      "base": 4.24, "unit": "per plate"},
        {"name": "Char Kway Teow",             "base": 4.90, "unit": "per plate"},
        {"name": "Laksa",                      "base": 5.20, "unit": "per bowl"},
        {"name": "Nasi Lemak",                 "base": 3.60, "unit": "per set"},
        {"name": "Ban Mian",                   "base": 4.80, "unit": "per bowl"},
        {"name": "Economical Rice (3 dishes)", "base": 4.10, "unit": "per set"},
        {"name": "Wonton Mee",                 "base": 4.40, "unit": "per bowl"},
        {"name": "Roti Prata (2pcs)",          "base": 2.40, "unit": "per 2 pieces"},
        # Hawker beverages
        {"name": "Kopi O (per cup)",           "base": 1.20, "unit": "per cup"},
        {"name": "Teh Tarik (per cup)",        "base": 1.40, "unit": "per cup"},
    ]

    def fetch(self) -> List[ScrapedPrice]:
        import random
        results = []
        for meal in self.MEALS:
            noise = random.gauss(0, meal["base"] * 0.04)
            price = round(max(meal["base"] * 0.8, meal["base"] + noise), 2)
            results.append(ScrapedPrice(
                item_name=meal["name"], category="hawker",
                price_sgd=price, unit=meal["unit"], source="Hawker Centre",
            ))
        return results


supermarket_scraper = SimulatedSupermarketScraper()
hawker_scraper = HawkerPriceScraper()
