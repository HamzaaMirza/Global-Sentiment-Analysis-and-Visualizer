import os
import json

from transformers import pipeline

def analyzeSentiment(file_path):

    print("Loading the sentiment analysis model")
    sentiment_pipeline = pipeline("sentiment-analysis")
    print("Model loaded successfully")


    try: 
        with open(file_path, 'r', encoding='utf-8') as f:
            articles = json.load(f)
    except FileNotFoundError:
        print(f"Error: The file {file_path} was not found.")
        return None
    
    analyzed_articles = []
    print(f"Analyzing sentiment for {len(articles)} articles...")

    #Looping through each article in the collected articles
    for article in articles:

        title = article.get('title')
        if not title:
            continue

        #this would return the results
        #The result is a list constaining a dictionary 
        result = sentiment_pipeline(title)

        #We extract the label (POSITIVE/NEGATIVE) and the score
        sentiment = result[0]['label']
        sentiment_score = result[0]['score']

        #Add the sentiment info to our article dictionary 
        article['sentiment'] = sentiment
        article['sentiment_score'] = sentiment_score 
        analyzed_articles.append(article)

    print("Analysis complete.")
    return analyzed_articles

if __name__ == "__main__":

    # Define the path to our input data file
    input_file = os.path.join(os.path.dirname(__file__), '..', 'data', 'global_headlines.json')
    
    # Run the analysis
    analyzed_data = analyze_headlines(input_file)

    if analyzed_data:
        # Define the path for our new output file
        output_file = os.path.join(os.path.dirname(__file__), '..', 'data', 'analyzed_headlines.json')
        
        # Save the new data (with sentiment) to a new JSON file
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(analyzed_data, f, indent=4, ensure_ascii=False)
        
        print(f"Successfully saved analyzed data to {output_file}")
        
        # Print a few examples to see the results
        print("\n--- Sample of Analyzed Headlines ---")
        for article in analyzed_data[:5]:
            print(f"Headline: {article['title']}")
            print(f"Sentiment: {article['sentiment']} (Score: {article['sentiment_score']:.2f})\n")


