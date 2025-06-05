import google.generativeai as genai
import requests
import json
import logging
from django.conf import settings
from typing import List, Dict, Any
from .models import HealthAssessment, Question, Answer

logger = logging.getLogger(__name__)

class GeminiService:
    def __init__(self):
        genai.configure(api_key="your_api_key_here")  # Replace with your actual API key
        self.model = genai.GenerativeModel('gemini-2.0-flash')
    
    def generate_initial_questions(self, concern: str) -> List[str]:
        """Generate initial questions based on the patient's concern"""
        prompt = f"""
        You are a medical AI assistant helping to conduct a health assessment. 
        A patient has expressed the following concern: "{concern}"
        
        Generate 2 relevant, specific medical questions to better understand their condition.
        The questions should be:
        1. Clear and easy to understand
        2. Medically relevant
        3. Help narrow down potential causes
        4. Appropriate for a non-medical person to answer
        
        Return only the questions, one per line, without numbering.
        """
        
        try:
            response = self.model.generate_content(prompt)
            
            # Extract text from response
            if response.text:
                questions = [q.strip() for q in response.text.strip().split('\n') if q.strip()]
                return questions[:2]  # Ensure we get exactly 5 questions
            else:
                raise Exception("No text generated from Gemini")
            
        except Exception as e:
            logger.error(f"Error generating questions with Gemini: {str(e)}")
            # Fallback generic questions
            return [
                "How long have you been experiencing this concern?",
                "On a scale of 1-10, how would you rate the severity?",
                "Does anything make it better or worse?",
                "Have you taken any medications for this?",
                "Do you have any family history of similar conditions?"
            ]
    
    def generate_followup_question(self, assessment: HealthAssessment) -> str:
        """Generate a follow-up question based on previous answers"""
        conversation_context = self._build_conversation_context(assessment)
        
        prompt = f"""
        You are conducting a medical assessment. Based on the following conversation:
        
        {conversation_context}
        
        Generate ONE more specific follow-up question that would help better understand 
        the patient's condition. The question should:
        1. Build on previous answers
        2. Help clarify any ambiguities
        3. Gather additional relevant information
        4. Be clear and specific
        
        Return only the question, nothing else.
        """
        
        try:
            response = self.model.generate_content(prompt)
            
            if response.text:
                return response.text.strip()
            else:
                raise Exception("No text generated from Gemini")
            
        except Exception as e:
            logger.error(f"Error generating follow-up question: {str(e)}")
            return "Is there anything else about your symptoms that you think might be important?"

    def _build_conversation_context(self, assessment: HealthAssessment) -> str:
        """Build conversation context for Gemini"""
        context = f"Initial concern: {assessment.initial_concern}\n\n"
        
        questions = assessment.questions.filter(is_answered=True).order_by('question_order')
        for question in questions:
            context += f"Q: {question.question_text}\n"
            if hasattr(question, 'answer'):
                context += f"A: {question.answer.answer_text}\n\n"
        
        return context

# Alternative implementation with more advanced features
class GeminiServiceAdvanced:
    def __init__(self):
        genai.configure(api_key=settings.GEMINI_API_KEY)
        # Use Gemini Pro for more complex reasoning
        self.model = genai.GenerativeModel('gemini-1.5-pro')
        
        # Configure generation parameters
        self.generation_config = genai.types.GenerationConfig(
            temperature=0.3,  # Lower temperature for more consistent medical responses
            max_output_tokens=1000,
            top_p=0.8,
            top_k=20
        )
        
        # Safety settings for medical content
        self.safety_settings = [
            {
                "category": "HARM_CATEGORY_MEDICAL",
                "threshold": "BLOCK_NONE"
            },
            {
                "category": "HARM_CATEGORY_HARASSMENT",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                "category": "HARM_CATEGORY_HATE_SPEECH",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE"
            }
        ]
    
    def generate_initial_questions(self, concern: str) -> List[str]:
        """Generate initial questions based on the patient's concern"""
        prompt = f"""
        You are a medical AI assistant helping to conduct a health assessment. 
        A patient has expressed the following concern: "{concern}"
        
        Generate 5 relevant, specific medical questions to better understand their condition.
        The questions should be:
        1. Clear and easy to understand
        2. Medically relevant
        3. Help narrow down potential causes
        4. Appropriate for a non-medical person to answer
        
        Return only the questions, one per line, without numbering.
        """
        
        try:
            response = self.model.generate_content(
                prompt,
                generation_config=self.generation_config,
                safety_settings=self.safety_settings
            )
            
            if response.text:
                questions = [q.strip() for q in response.text.strip().split('\n') if q.strip()]
                return questions[:5]  # Ensure we get exactly 5 questions
            else:
                raise Exception("No text generated from Gemini")
            
        except Exception as e:
            logger.error(f"Error generating questions with Gemini: {str(e)}")
            # Fallback generic questions
            return [
                "How long have you been experiencing this concern?",
                "On a scale of 1-10, how would you rate the severity?",
                "Does anything make it better or worse?",
                "Have you taken any medications for this?",
                "Do you have any family history of similar conditions?"
            ]
    
    def generate_followup_question(self, assessment: HealthAssessment) -> str:
        """Generate a follow-up question based on previous answers"""
        conversation_context = self._build_conversation_context(assessment)
        
        prompt = f"""
        You are conducting a medical assessment. Based on the following conversation:
        
        {conversation_context}
        
        Generate ONE more specific follow-up question that would help better understand 
        the patient's condition. The question should:
        1. Build on previous answers
        2. Help clarify any ambiguities
        3. Gather additional relevant information
        4. Be clear and specific
        
        Return only the question, nothing else.
        """
        
        try:
            response = self.model.generate_content(
                prompt,
                generation_config=self.generation_config,
                safety_settings=self.safety_settings
            )
            
            if response.text:
                return response.text.strip()
            else:
                raise Exception("No text generated from Gemini")
            
        except Exception as e:
            logger.error(f"Error generating follow-up question: {str(e)}")
            return "Is there anything else about your symptoms that you think might be important?"

    def _build_conversation_context(self, assessment: HealthAssessment) -> str:
        """Build conversation context for Gemini"""
        context = f"Initial concern: {assessment.initial_concern}\n\n"
        
        questions = assessment.questions.filter(is_answered=True).order_by('question_order')
        for question in questions:
            context += f"Q: {question.question_text}\n"
            if hasattr(question, 'answer'):
                context += f"A: {question.answer.answer_text}\n\n"
        
        return context