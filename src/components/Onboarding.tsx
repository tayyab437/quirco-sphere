import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  Send, 
  BarChart3, 
  CheckCircle2, 
  ChevronRight, 
  ChevronLeft,
  X
} from 'lucide-react';

interface OnboardingProps {
  onComplete: () => void;
  userName?: string;
}

const steps = [
  {
    title: "Welcome to QuirkoSphere!",
    description: "Your all-in-one social media management hub powered by AI. Let's show you around.",
    icon: <Sparkles className="w-12 h-12 text-orange-500" />,
    color: "bg-orange-50"
  },
  {
    title: "Meet Your AI Agents",
    description: "Generate creative content, brainstorm ideas, and refine your brand voice with our specialized AI agents.",
    icon: <Sparkles className="w-12 h-12 text-purple-500" />,
    color: "bg-purple-50"
  },
  {
    title: "Seamless Posting",
    description: "Draft, schedule, and publish posts across all your connected social platforms from a single interface.",
    icon: <Send className="w-12 h-12 text-blue-500" />,
    color: "bg-blue-50"
  },
  {
    title: "Powerful Analytics",
    description: "Track your performance with real-time insights. See what works and grow your audience effectively.",
    icon: <BarChart3 className="w-12 h-12 text-green-500" />,
    color: "bg-green-50"
  },
  {
    title: "Ready to Grow?",
    description: "Connect your social accounts in the Profile section and start creating magic today!",
    icon: <CheckCircle2 className="w-12 h-12 text-orange-600" />,
    color: "bg-orange-100"
  }
];

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete, userName }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-2xl overflow-hidden max-w-lg w-full relative"
      >
        {/* Close Button */}
        <button 
          onClick={onComplete}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="p-8 pt-12"
          >
            <div className={`w-24 h-24 ${steps[currentStep].color} rounded-3xl flex items-center justify-center mb-8 mx-auto shadow-sm`}>
              {steps[currentStep].icon}
            </div>

            <div className="text-center space-y-4">
              <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
                {currentStep === 0 && userName ? `Hi ${userName}, ` : ''}{steps[currentStep].title}
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed max-w-sm mx-auto">
                {steps[currentStep].description}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="p-8 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <div className="flex gap-1.5">
            {steps.map((_, idx) => (
              <div 
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentStep ? 'w-8 bg-orange-500' : 'w-2 bg-gray-300'
                }`}
              />
            ))}
          </div>

          <div className="flex gap-3">
            {currentStep > 0 && (
              <button
                onClick={handlePrev}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 font-medium hover:bg-gray-200 rounded-xl transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 shadow-lg shadow-orange-200 transition-all active:scale-95"
            >
              {currentStep === steps.length - 1 ? 'Get Started' : 'Next'}
              {currentStep < steps.length - 1 && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
