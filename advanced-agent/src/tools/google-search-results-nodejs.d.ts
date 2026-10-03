declare module "google-search-results-nodejs" {
  namespace SerpApi {
    interface SearchParams {
      engine: string;
      q: string;
      api_key: string;
      gl: string;
      hl: string;
    }

    interface SearchResults {
      answer_box_list?: string[];
      answer_box?: { answer?: string };
      knowledge_graph?: { description?: string };
      organic_results?: Array<{ title?: string; snippet?: string }>;
    }

    class GoogleSearch {
      constructor(apiKey: string);
      json(params: SearchParams, callback: (results: SearchResults) => void): void;
    }
  }

  export = SerpApi;
}
