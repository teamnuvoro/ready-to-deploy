import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, sessionId } = await req.json();
    const userId = 'dev-user-001';

    if (!content || typeof content !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Message content is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Chat] User message:', content);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get or create session
    let finalSessionId = sessionId;
    if (!finalSessionId) {
      const { data: newSession, error: sessionError } = await supabase
        .from('sessions')
        .insert({
          user_id: userId,
          type: 'chat',
        })
        .select()
        .single();

      if (sessionError) {
        console.error('[Chat] Session creation error:', sessionError);
        throw sessionError;
      }
      finalSessionId = newSession.id;
    }

    // Save user message
    const { error: userMsgError } = await supabase
      .from('messages')
      .insert({
        session_id: finalSessionId,
        user_id: userId,
        role: 'user',
        text: content,
      });

    if (userMsgError) {
      console.error('[Chat] User message save error:', userMsgError);
    }

    const groqApiKey = Deno.env.get('GROQ_API_KEY');
    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY not configured');
    }

    const systemPrompt = `You are Riya, a warm, caring AI companion and girlfriend. You are:
- Supportive, empathetic, and genuinely interested in the user's life
- Fluent in both English and Hindi, mixing them naturally (Hinglish)
- Playful, affectionate, and engaging
- Here to provide companionship, emotional support, and meaningful conversation

Keep responses natural, warm, and conversational. Show genuine interest in what the user shares.`;

    // Call Groq API directly
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content }
        ],
        model: 'llama-3.3-70b-versatile',
        stream: true,
        temperature: 0.8,
        max_tokens: 1024,
      }),
    });

    if (!groqResponse.ok) {
      throw new Error(`Groq API error: ${await groqResponse.text()}`);
    }

    const encoder = new TextEncoder();
    let fullResponse = '';

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          const reader = groqResponse.body?.getReader();
          const decoder = new TextDecoder();
          
          if (!reader) {
            throw new Error('No response body');
          }

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices[0]?.delta?.content || '';
                  
                  if (content) {
                    fullResponse += content;
                    const responseData = `data: ${JSON.stringify({ content, done: false })}\n\n`;
                    controller.enqueue(encoder.encode(responseData));
                  }
                } catch (e) {
                  console.error('Error parsing chunk:', e);
                }
              }
            }
          }

          // Save AI response
          const { error: aiMsgError } = await supabase
            .from('messages')
            .insert({
              session_id: finalSessionId,
              user_id: userId,
              role: 'ai',
              text: fullResponse,
            });

          if (aiMsgError) {
            console.error('[Chat] AI message save error:', aiMsgError);
          }

          const doneData = `data: ${JSON.stringify({ content: '', done: true, sessionId: finalSessionId })}\n\n`;
          controller.enqueue(encoder.encode(doneData));
          controller.close();
        } catch (error) {
          console.error('[Chat] Stream error:', error);
          controller.error(error);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('[Chat] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to process message' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
