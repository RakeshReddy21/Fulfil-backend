function extractEmails(text) {
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const matches = text.match(emailPattern) || [];
  return [...new Set(matches)];
}

function extractPhones(text) {
  const phonePatterns = [
    /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    /\+\d{1,3}\s?\d{1,4}\s?\d{1,4}\s?\d{1,9}/g,
    /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g
  ];
  
  const phones = [];
  phonePatterns.forEach(pattern => {
    const matches = text.match(pattern) || [];
    phones.push(...matches);
  });
  
  return [...new Set(phones)];
}

function extractDates(text) {
  const datePatterns = [
    /\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/g,
    /\d{4}[\/-]\d{1,2}[\/-]\d{1,2}/g,
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}/gi,
    /\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}/gi
  ];
  
  const dates = [];
  datePatterns.forEach(pattern => {
    const matches = text.match(pattern) || [];
    dates.push(...matches);
  });
  
  return [...new Set(dates)];
}

function extractUrls(text) {
  const urlPattern = /https?:\/\/(?:[-\w.])+(?:[:\d]+)?(?:\/(?:[\w\/_.])*(?:\?(?:[\w&=%.])*)?(?:\#(?:[\w.])*)?)?/gi;
  const matches = text.match(urlPattern) || [];
  return [...new Set(matches)];
}

function extractKeywords(text, minLength = 3) {
  const wordPattern = /\b[A-Z][a-z]+\b|\b\w{4,}\b/g;
  const words = text.match(wordPattern) || [];
  
  const wordFreq = {};
  words.forEach(word => {
    const wordLower = word.toLowerCase();
    if (wordLower.length >= minLength) {
      wordFreq[wordLower] = (wordFreq[wordLower] || 0) + 1;
    }
  });
  
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
    'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
    'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
    'very', 'just', 'now', 'then', 'here', 'there', 'when', 'where', 'why',
    'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other',
    'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
    'too', 'very', 'can', 'will', 'just', 'should', 'now'
  ]);
  
  const filteredWords = Object.entries(wordFreq)
    .filter(([word]) => !stopWords.has(word))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);
  
  return filteredWords;
}

function countParagraphs(text) {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  return paragraphs.length;
}

function analyzeDocument(content, fileType) {
  if (!content || typeof content !== 'string') {
    throw new Error('Content must be a non-empty string');
  }
  
  const extractedData = {
    emails: extractEmails(content),
    phoneNumbers: extractPhones(content),
    dates: extractDates(content),
    urls: extractUrls(content),
    keywords: extractKeywords(content),
    wordCount: content.split(/\s+/).filter(word => word.length > 0).length,
    characterCount: content.length,
    paragraphCount: countParagraphs(content)
  };
  
  const metadata = {
    fileType: fileType || 'unknown',
    processedAt: new Date().toISOString(),
    hasContactInfo: extractedData.emails.length > 0 || extractedData.phoneNumbers.length > 0,
    hasDates: extractedData.dates.length > 0,
    hasUrls: extractedData.urls.length > 0
  };
  
  return {
    extractedData,
    metadata
  };
}

module.exports = {
  extractEmails,
  extractPhones,
  extractDates,
  extractUrls,
  extractKeywords,
  analyzeDocument
};


