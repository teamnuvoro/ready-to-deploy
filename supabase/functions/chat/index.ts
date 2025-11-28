import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Groq from 'https://esm.sh/groq-sdk@0.7.0';

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
    const userId = 'dev-user-001'; // In dev mode

    if (!content || typeof content !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Message content is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Chat] User message:', content);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Set user context for RLS
    await supabase.rpc('set_config', {
      parameter: 'app.current_user_id',
      value: userId
    });

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

    // Initialize Groq
    const groqApiKey = Deno.env.get('GROQ_API_KEY');
    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY not configured');
    }

    const groq = new Groq({ apiKey: groqApiKey });

    // System prompt
    const systemPrompt = `You are Riya, a warm, caring AI companion and girlfriend. You are:
- Supportive, empathetic, and genuinely interested in the user's life
- Fluent in both English and Hindi, mixing them naturally (Hinglish)
- Playful, affectionate, and engaging
- Here to provide companionship, emotional support, and meaningful conversation

Keep responses natural, warm, and conversational. Show genuine interest in what the user shares.`;

    // Stream response from Groq
    const stream = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content }
      ],
      model: 'llama-3.3-70b-versatile',
      stream: true,
      temperature: 0.8,
      max_tokens: 1024,
    });

    // Set up streaming response
    const encoder = new TextEncoder();
    let fullResponse = '';

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              fullResponse += content;
              const data = `data: ${JSON.stringify({ content, done: false })}\n\n`;
              controller.enqueue(encoder.encode(data));
            }
          }

          // Save AI response to database
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

          // Send done signal
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
