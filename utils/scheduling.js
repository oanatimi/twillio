// utils/scheduling.js - Working hours and scheduling logic

function isWorkingDay(dayName) {
  const workingDays = ['luni', 'marți', 'miercuri', 'joi', 'vineri'];
  return workingDays.includes(dayName.toLowerCase());
}

function isWorkingHour(hour) {
  return hour >= 8 && hour <= 17;
}

function getCurrentDayInfo() {
  const now = new Date();
  const days = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
  const currentDay = days[now.getDay()];
  const currentHour = now.getHours();
  
  return {
    day: currentDay,
    hour: currentHour,
    isWorkingDay: isWorkingDay(currentDay),
    isWorkingHour: isWorkingHour(currentHour)
  };
}

function getNextWorkingDay() {
  const now = new Date();
  const days = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
  const workingDays = ['luni', 'marți', 'miercuri', 'joi', 'vineri'];
  
  // If today is Friday after hours, next working day is Monday
  if (now.getDay() === 5 && now.getHours() >= 17) {
    return 'luni';
  }
  
  // If weekend, next working day is Monday
  if (now.getDay() === 0 || now.getDay() === 6) {
    return 'luni';
  }
  
  // If weekday before 17:00, can work today
  if (workingDays.includes(days[now.getDay()]) && now.getHours() < 17) {
    return 'astăzi';
  }
  
  // Otherwise next working day
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return days[tomorrow.getDay()];
}

module.exports = {
  isWorkingDay,
  isWorkingHour,
  getCurrentDayInfo,
  getNextWorkingDay
};