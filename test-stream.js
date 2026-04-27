import { streamText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

async function test() {
  try {
    const google = createGoogleGenerativeAI({ apiKey: 'test' });
    const result = streamText({
      model: google('gemini-1.5-flash'),
      messages: [{role: 'user', content: 'hello'}],
    });
    const response = result.toDataStreamResponse();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      console.log('CHUNK:', decoder.decode(value));
    }
  } catch (e) {
    console.error('ERROR:', e.message);
  }
}
test();
