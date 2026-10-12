import ollama
import json

MODEL = "llama3"

# ==========================
# CARGAR CV
# ==========================

def load_cv():
    with open("cv.json", "r", encoding="utf-8") as file:
        return json.load(file)

cv = load_cv()

# =========================
# CARGAR REGLAS
# ========================

with open("rules.txt", "r", encoding="utf-8") as file:
    rules = file.read()


def choose_language():

    print("""
Choose response language:

1 - English
2 - Spanish
""")

    choice = input("Language: ")

    if choice == "2":
        return "Spanish"

    else:
        return "English"

def save_memory(note):
    try:
        with open("memory.json", "r", encoding="utf-8") as f:
            data = json.load(f)
    except:
        data = []

    data.append(note)

    with open("memory.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

def load_memory():
    try:
        with open("memory.json", "r", encoding="utf-8") as f:
            data = json.load(f)
            return "\n".join(data)
    except:
        return ""

def learn_from_feedback(feedback):

    prompt = f"""
You are a strict writing assistant.

Convert user feedback into ONE clear, short, reusable rule.

RULE FORMAT:
- Max 15 words
- Imperative style (e.g., "Use shorter sentences")
- No explanations
- No extra text

Feedback:
{feedback}

Return ONLY the rule.
"""

    response = ollama.chat(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}]
    )

    rule = response["message"]["content"].strip()

    # Limpieza básica
    rule = rule.replace("\n", " ").strip()

    # Validación simple
    if len(rule.split()) > 20:
        print("\nRule too long, ignored:\n")
        print(rule)
        return

    if len(rule) < 5:
        print("\nRule too short, ignored\n")
        return

    # Evitar duplicados
    try:
        with open("memory.json", "r", encoding="utf-8") as f:
            existing_rules = json.load(f)
    except:
        existing_rules = []

    if rule in existing_rules:
        print("\nRule already exists\n")
        return

    # Guardar
    save_memory(rule)

    print("\n✅ Learned rule:\n")
    print(rule)

# ==========================
# HABLAR CON IA
# ==========================

def ask_agent(prompt, language="English"):

    memory = load_memory()
    cv_data = load_cv()

    full_prompt = f"""
You are a highly strategic job application assistant for Pedro Joaquin Cannavo.

Always answer in the requested language:
{language}

These are the core writing rules you must ALWAYS follow:

{rules}

You must follow these learned preferences from the user:

{memory}

Candidate CV data:
{json.dumps(cv_data, indent=2, ensure_ascii=False)}

Now complete the task:

{prompt}
"""

    response = ollama.chat(
        model=MODEL,
        messages=[
            {
                "role": "user",
                "content": full_prompt
            }
        ]
    )

    return response["message"]["content"]


# ==========================
# MENU
# ==========================
def main():
    language = choose_language()

    while True:

        print("""
    ========================
    JOB APPLICATION AGENT
    ========================

    1 - Create cover letter
    2 - Answer application question
    3 - Improve existing answer
    4 - Add memory / preference
    5 - Show memory
    6 - Exit
    7 - Analyze job offer
    8 - Give feedback (auto-learn)

    """)

        option = input("Choose option: ")


        if option == "1":

            job = input("\nPaste job description:\n")

            result = ask_agent(
        f"""
        First, analyze this job offer internally.

        Then, based on that analysis, write a highly targeted and personalized cover letter.

        Job description:
    {job}

    Do not show the analysis.

    Only return the final cover letter.
    """,
        language
    )

            print("\nRESULT:\n")
            print(result)



        elif option == "2":

            question = input("\nApplication question:\n")

            result = ask_agent(
                f"""
    Answer this job application question:

    {question}
    """,
                language
            )

            print("\nRESULT:\n")
            print(result)



        elif option == "3":

            answer = input("\nPaste your answer:\n")

            result = ask_agent(
                f"""
    Improve this answer professionally:

    {answer}
    """,
                language
            )

            print("\nRESULT:\n")
            print(result)



        elif option == "4":

            note = input("\nWrite a correction or preference:\n")

            save_memory(note)

            print("\nSaved to memory.\n")



        elif option == "5":

            memory = load_memory()
            if memory:
                print("\n--- MEMORY ---")
                print(memory)
                print("--------------\n")
            else:
                print("\nNo memory saved yet.\n")

        elif option == "7":

            job = input("\nPaste job description:\n")

            result = ask_agent(
            f"""
            Analyze this job offer and give a strategic breakdown.

            Job description:
            {job}

            Return:

            1. Key requirements (bullet points)
            2. Most relevant parts of Pedro's profile
            3. Skills he should highlight
            4. Potential weaknesses or gaps
            5. Suggested positioning (how he should present himself)
            6. Recommended tone (formal, technical, friendly, etc.)
            """,
                    language
                )

            print("\nANALYSIS:\n")
            print(result)

        elif option == "8":

            feedback = input("\nWrite your feedback:\n")

            learn_from_feedback(feedback)

        elif option == "6":

            break

if __name__ == "__main__":
    main()
