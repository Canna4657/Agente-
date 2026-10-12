import ollama

respuesta = ollama.chat(
    model="llama3",
    messages=[
        {
            "role": "user",
            "content": "Explica en una frase qué es un agente de IA."
        }
    ]
)

print(respuesta["message"]["content"])
