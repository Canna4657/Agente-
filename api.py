from flask import Flask, request, jsonify
from flask_cors import CORS
import ollama
import json
import os

app = Flask(__name__)
CORS(app)

MODEL = "llama3"
CV_PATH = os.path.join(os.path.dirname(__file__), "cv.json")
RULES_PATH = os.path.join(os.path.dirname(__file__), "rules.txt")
MEMORY_PATH = os.path.join(os.path.dirname(__file__), "memory.json")


def load_cv():
    with open(CV_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def load_rules():
    with open(RULES_PATH, "r", encoding="utf-8") as f:
        return f.read()

def load_memory():
    try:
        with open(MEMORY_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return "\n".join(data)
    except:
        return ""


# ==========================
# GET CV
# ==========================
@app.route("/cv", methods=["GET"])
def get_cv():
    return jsonify(load_cv())


# ==========================
# INTERPRET FIELD
# ==========================
@app.route("/interpret", methods=["POST"])
def interpret():

    data = request.get_json()
    field = data.get("field", "")
    context = data.get("context", "")  # texto cercano al campo

    prompt = f"""
You are an expert job application form analyzer.

Your task is to classify the form field into ONE category.

Field label:
"{field}"

Nearby context (surrounding text on the page):
"{context}"

Choose ONLY ONE of these categories:

first_name
last_name
full_name
email
phone
linkedin
location
city
country
company
job_title
job_title_current
start_date
end_date
currently_working
education_degree
education_institution
education_start
education_end
experience_description
skills
cover_letter
salary_expectation
date_of_birth
open_question
website
portfolio
unknown

Rules:
- date_of_birth = birth, DOB, birthday, fecha de nacimiento
- start_date = job start date, desde, from
- end_date = job end date, hasta, to, "present" checkbox area
- currently_working = checkbox about still working there
- open_question = questions like "Why do you want to work here?", "Tell us about yourself", anything ending with "?"
- cover_letter = "cover letter", "carta de presentacion", "motivation letter"
- company = employer name, nombre de empresa
- job_title = position, cargo, rol, puesto

Return ONLY the category name. No explanation.
"""

    response = ollama.chat(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}]
    )

    result = response["message"]["content"].strip().lower()
    # Sanitize: keep only the first word in case the model returns extra text
    result = result.split()[0] if result else "unknown"

    return jsonify({"type": result})


# ==========================
# GET VALUE FOR FIELD
# ==========================
@app.route("/value", methods=["POST"])
def value():

    data = request.get_json()
    field_type = data.get("type", "")
    field_name = data.get("field", "")
    language = data.get("language", "English")
    experience_index = data.get("experience_index", 0)

    cv = load_cv()

    # ---- Simple fields: return directly from cv.json without calling AI ----
    direct_map = {
        "first_name":  cv["personal_info"]["first_name"],
        "last_name":   cv["personal_info"]["last_name"],
        "full_name":   cv["personal_info"]["full_name"],
        "email":       cv["personal_info"]["email"],
        "phone":       cv["personal_info"]["phone"],
        "linkedin":    cv["personal_info"]["linkedin"],
        "location":    cv["personal_info"]["location"],
        "city":        "Vicente López",
        "country":     "Argentina",
        "date_of_birth": cv["personal_info"]["date_of_birth"],
    }

    if field_type in direct_map:
        return jsonify({"value": direct_map[field_type]})

    # ---- Experience location (inside a job block, e.g. "New Zealand") ----
    if field_type == "experience_location":
        idx = min(experience_index, len(cv["experience"]) - 1)
        return jsonify({"value": cv["experience"][idx]["location"]})

    # ---- Experience fields: pick by index ----
    if field_type == "company":
        idx = min(experience_index, len(cv["experience"]) - 1)
        return jsonify({"value": cv["experience"][idx]["company"]})

    if field_type == "job_title" or field_type == "job_title_current":
        idx = min(experience_index, len(cv["experience"]) - 1)
        return jsonify({"value": cv["experience"][idx]["role"]})

    if field_type == "start_date":
        idx = min(experience_index, len(cv["experience"]) - 1)
        return jsonify({"value": cv["experience"][idx]["start_date"]})

    if field_type == "end_date":
        idx = min(experience_index, len(cv["experience"]) - 1)
        return jsonify({"value": cv["experience"][idx]["end_date"]})

    if field_type == "currently_working":
        idx = min(experience_index, len(cv["experience"]) - 1)
        return jsonify({"value": cv["experience"][idx].get("still_working", False)})

    if field_type == "education_degree":
        return jsonify({"value": cv["education"][0]["degree"]})

    if field_type == "education_institution":
        return jsonify({"value": cv["education"][0]["institution"]})

    if field_type == "education_start":
        return jsonify({"value": cv["education"][0]["start_year"]})

    if field_type == "education_end":
        return jsonify({"value": cv["education"][0]["end_year"]})

    if field_type == "skills":
        return jsonify({"value": ", ".join(cv["skills"])})

    # ---- AI-generated fields ----
    rules = load_rules()
    memory = load_memory()

    prompt = f"""
You are filling a job application form for Pedro Joaquin Cannavo.
Always answer in: {language}

Field name: "{field_name}"
Field type: "{field_type}"

Candidate data:
{json.dumps(cv, indent=2, ensure_ascii=False)}

Writing rules:
{rules}

Learned preferences:
{memory}

Instructions:
- Return ONLY the value. No explanations, no labels, no markdown.
- experience_description: 2-3 bullet points about the most recent job experience
- cover_letter: write a full professional cover letter (3-4 paragraphs)
- open_question: professional but natural answer, 3-5 lines max
- salary_expectation: return a realistic range for Argentina
- website / portfolio: return "N/A" if not available

Return ONLY the raw value.
"""

    response = ollama.chat(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}]
    )

    result = response["message"]["content"].strip()
    return jsonify({"value": result})


# ==========================
# GENERATE FREE PROMPT
# ==========================
@app.route("/generate", methods=["POST", "OPTIONS"])
def generate():

    if request.method == "OPTIONS":
        return '', 200

    data = request.get_json(silent=True) or {}
    prompt = data.get("prompt", "")
    language = data.get("language", "English")

    cv = load_cv()
    rules = load_rules()
    memory = load_memory()

    full_prompt = f"""
You are a highly strategic job application assistant for Pedro Joaquin Cannavo.
Always answer in: {language}

Writing rules:
{rules}

Learned preferences:
{memory}

Candidate CV:
{json.dumps(cv, indent=2, ensure_ascii=False)}

Task:
{prompt}
"""

    response = ollama.chat(
        model=MODEL,
        messages=[{"role": "user", "content": full_prompt}]
    )

    return jsonify({"response": response["message"]["content"]})


if __name__ == "__main__":
    app.run(port=5000, debug=False)