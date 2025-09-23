const OnboardingStep = require('../models/OnboardingStep');
const User = require('../models/User');

// Store onboarding step data
const storeOnboardingStep = async (req, res) => {
  try {
    const { userId, data } = req.body;

    if (!userId || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'User ID and data array are required'
      });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const results = [];

    for (const stepData of data) {
      const { step } = stepData;

      // Validate step number
      if (!step || step < 1 || step > 9) {
        continue; // skip invalid step
      }

      // Check if step already exists
      const existingStep = await OnboardingStep.findOne({ userId, step });

      let onboardingStep;

      if (existingStep) {
        const updateData = { ...stepData, updatedAt: new Date() };

        onboardingStep = await OnboardingStep.findByIdAndUpdate(
          existingStep._id,
          updateData,
          { new: true, runValidators: true }
        );
      } else {
        const newStep = {
          userId,
          step,
          ...stepData,
          completedAt: new Date()
        };

        onboardingStep = await OnboardingStep.create(newStep);
      }

      results.push({
        step: onboardingStep.step,
        summary: onboardingStep.getStepSummary?.() ?? null,
        completedAt: onboardingStep.completedAt
      });
    }

    res.status(200).json({
      success: true,
      message: 'Onboarding steps stored successfully',
      data: results
    });

  } catch (error) {
    console.error('Error storing onboarding steps:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Store multiple onboarding steps (bulk operation)
const storeMultipleOnboardingSteps = async (req, res) => {
  try {
    const { userId, data } = req.body;

    console.log('Received request:', { userId, dataLength: data?.length });

    // Validate required fields
    if (!userId || !data || !Array.isArray(data)) {
      return res.status(400).json({
        success: false,
        message: 'User ID and data array are required'
      });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const results = [];
    const errors = [];

    // Process each step
    for (const stepData of data) {
      try {
        const { step, ...stepFields } = stepData;

        console.log('Processing step:', { step, stepFields });

        if (!step || step < 1 || step > 9) {
          errors.push({ step, error: 'Invalid step number' });
          continue;
        }

        // Check if step already exists
        const existingStep = await OnboardingStep.findOne({ userId, step });
        
        let onboardingStep;
        
        if (existingStep) {
          // Update existing step
          const updateData = { 
            ...stepFields, 
            updatedAt: new Date() 
          };
          
          // Handle specific step data
          if (step === 1) {
            if (stepFields.height !== undefined) updateData.height = stepFields.height;
            if (stepFields.unit !== undefined) updateData.unit = stepFields.unit;
          } else if (step === 2) {
            if (stepFields.emergency_contact_relation !== undefined) updateData.emergency_contact_relation = stepFields.emergency_contact_relation;
            if (stepFields.emergency_contact_name !== undefined) updateData.emergency_contact_name = stepFields.emergency_contact_name;
            if (stepFields.emergency_contact !== undefined) updateData.emergency_contact = stepFields.emergency_contact;
          } else if (step === 3) {
            if (stepFields.blood_group !== undefined) updateData.blood_group = stepFields.blood_group;
          } else if (step === 5) {
            if (stepFields.provider !== undefined) updateData.provider = stepFields.provider;
            if (stepFields.success !== undefined) updateData.success = stepFields.success;
            if (stepFields.skipped !== undefined) updateData.skipped = stepFields.skipped;
          } else if (step === 6) {
            if (stepFields.allergies !== undefined) updateData.allergies = stepFields.allergies;
            if (stepFields.allergy_description !== undefined) updateData.allergy_description = stepFields.allergy_description;
          } else if (step === 7) {
            if (stepFields.disorders !== undefined) updateData.disorders = stepFields.disorders;
            if (stepFields.disorder_detail !== undefined) updateData.disorder_detail = stepFields.disorder_detail;
          } else if (step === 8) {
            if (stepFields.avatar !== undefined) updateData.avatar = stepFields.avatar;
          }

          onboardingStep = await OnboardingStep.findByIdAndUpdate(
            existingStep._id,
            updateData,
            { new: true, runValidators: true }
          );
        } else {
          // Create new step
          const newStepData = {
            userId,
            step,
            data: stepFields,
            completedAt: new Date()
          };

          // Add specific fields based on step
          if (step === 1) {
            if (stepFields.height !== undefined) newStepData.height = stepFields.height;
            if (stepFields.unit !== undefined) newStepData.unit = stepFields.unit;
          } else if (step === 2) {
            if (stepFields.emergency_contact_relation !== undefined) newStepData.emergency_contact_relation = stepFields.emergency_contact_relation;
            if (stepFields.emergency_contact_name !== undefined) newStepData.emergency_contact_name = stepFields.emergency_contact_name;
            if (stepFields.emergency_contact !== undefined) newStepData.emergency_contact = stepFields.emergency_contact;
          } else if (step === 3) {
            if (stepFields.blood_group !== undefined) newStepData.blood_group = stepFields.blood_group;
          } else if (step === 5) {
            if (stepFields.provider !== undefined) newStepData.provider = stepFields.provider;
            if (stepFields.success !== undefined) newStepData.success = stepFields.success;
            if (stepFields.skipped !== undefined) newStepData.skipped = stepFields.skipped;
          } else if (step === 6) {
            if (stepFields.allergies !== undefined) newStepData.allergies = stepFields.allergies;
            if (stepFields.allergy_description !== undefined) newStepData.allergy_description = stepFields.allergy_description;
          } else if (step === 7) {
            if (stepFields.disorders !== undefined) newStepData.disorders = stepFields.disorders;
            if (stepFields.disorder_detail !== undefined) newStepData.disorder_detail = stepFields.disorder_detail;
          } else if (step === 8) {
            if (stepFields.avatar !== undefined) newStepData.avatar = stepFields.avatar;
          }

          console.log('Creating new step with data:', newStepData);
          onboardingStep = await OnboardingStep.create(newStepData);
        }

        results.push({
          step: onboardingStep.step,
          summary: onboardingStep.getStepSummary(),
          completedAt: onboardingStep.completedAt
        });

      } catch (stepError) {
        console.error(`Error processing step ${stepData.step}:`, stepError);
        errors.push({ 
          step: stepData.step, 
          error: stepError.message 
        });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Onboarding steps processed successfully',
      data: {
        results,
        errors: errors.length > 0 ? errors : undefined,
        totalProcessed: results.length,
        totalErrors: errors.length
      }
    });

  } catch (error) {
    console.error('Error storing multiple onboarding steps:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get user's onboarding progress
const getUserOnboardingProgress = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const steps = await OnboardingStep.getUserProgress(userId);
    const isComplete = await OnboardingStep.isOnboardingComplete(userId);

    res.status(200).json({
      success: true,
      message: 'Onboarding progress retrieved successfully',
      data: {
        userId,
        steps: steps.map(step => step.getStepSummary()),
        totalSteps: steps.length,
        isComplete,
        progressPercentage: Math.round((steps.length / 9) * 100)
      }
    });

  } catch (error) {
    console.error('Error getting onboarding progress:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get specific step data
const getOnboardingStep = async (req, res) => {
  try {
    const { userId, step } = req.params;

    if (!userId || !step) {
      return res.status(400).json({
        success: false,
        message: 'User ID and step are required'
      });
    }

    const stepNumber = parseInt(step);
    if (stepNumber < 1 || stepNumber > 9) {
      return res.status(400).json({
        success: false,
        message: 'Step must be between 1 and 9'
      });
    }

    const onboardingStep = await OnboardingStep.getUserStep(userId, stepNumber);

    if (!onboardingStep) {
      return res.status(404).json({
        success: false,
        message: 'Onboarding step not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Onboarding step retrieved successfully',
      data: {
        step: onboardingStep.step,
        summary: onboardingStep.getStepSummary(),
        completedAt: onboardingStep.completedAt,
        updatedAt: onboardingStep.updatedAt
      }
    });

  } catch (error) {
    console.error('Error getting onboarding step:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Delete onboarding step
const deleteOnboardingStep = async (req, res) => {
  try {
    const { userId, step } = req.params;

    if (!userId || !step) {
      return res.status(400).json({
        success: false,
        message: 'User ID and step are required'
      });
    }

    const stepNumber = parseInt(step);
    if (stepNumber < 1 || stepNumber > 9) {
      return res.status(400).json({
        success: false,
        message: 'Step must be between 1 and 9'
      });
    }

    const deletedStep = await OnboardingStep.findOneAndDelete({ userId, step: stepNumber });

    if (!deletedStep) {
      return res.status(404).json({
        success: false,
        message: 'Onboarding step not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Onboarding step deleted successfully',
      data: {
        step: deletedStep.step,
        deletedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Error deleting onboarding step:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

module.exports = {
  storeOnboardingStep,
  storeMultipleOnboardingSteps,
  getUserOnboardingProgress,
  getOnboardingStep,
  deleteOnboardingStep
};
