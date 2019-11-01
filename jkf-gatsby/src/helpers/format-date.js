const formatDateFullMonth = dateString => {
  const dateInfo = extractDateInfo(dateString)

  return `${dateInfo.month} ${dateInfo.day}, ${dateInfo.year}`
}

const formatDateShortMonth = dateString => {
  const dateInfo = extractDateInfo(dateString)
  const shortMonth = dateInfo.month.substring(0, 3)

  return `${shortMonth} ${dateInfo.day}, ${dateInfo.year}`
}

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

const extractDateInfo = dateString => {
  const date = new Date(dateString)

  const day = date.getDate()
  const monthIndex = date.getMonth()
  const year = date.getFullYear()

  return {
    month: monthNames[monthIndex],
    day: day,
    year: year,
  }
}

export { formatDateFullMonth, formatDateShortMonth }
