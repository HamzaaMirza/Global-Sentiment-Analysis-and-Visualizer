#Script that will fetch a batch of news articles from NEWSAPI to be used in my project 
import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv('NEWS_API_KEY')
BASE_URL = 'https://newsapi.org/v2/top-headlines'

def get_headlines_by_category(category='general', language='en'):
   
    if not API_KEY:
        print("Error: NEWS_API_KEY not found. Please set it in your .env file.")
        return None
    
    # We now use 'category' and 'language' parameters
    params = {
        'category': category,
        'language': language,
        'apiKey': API_KEY,
        'pageSize': 100 # Let's get the max number of articles in one request
    }

    print(f"Fetching '{category}' headlines...")
    try:
        response = requests.get(BASE_URL, params=params)
        response.raise_for_status() 
        data = response.json()
        return data.get('articles', [])

    except requests.exceptions.RequestException as e:
        print(f"An error occurred: {e}")
        return None

if __name__ == "__main__":
    articles = get_headlines_by_category('general')
    
    if articles:
        data_dir = os.path.join(os.path.dirname(__file__), '..', 'data')
        os.makedirs(data_dir, exist_ok=True)
        
        # Save to a single file
        file_path = os.path.join(data_dir, 'global_headlines.json')
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(articles, f, indent=4, ensure_ascii=False)
        
        print(f"Successfully saved {len(articles)} articles to {file_path}")
    else:
        print("Could not fetch or save articles.")
    
    print("\nFetching complete!")