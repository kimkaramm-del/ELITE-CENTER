import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import PublicLayout from '../layouts/PublicLayout.jsx'
import DashboardLayout from '../layouts/DashboardLayout.jsx'
import Home from '../pages/Home.jsx'
import GradeDetails from '../pages/GradeDetails.jsx'
import Courses from '../pages/Courses.jsx'
import CourseDetails from '../pages/CourseDetails.jsx'
import Teachers from '../pages/Teachers.jsx'
import TeacherDetails from '../pages/TeacherDetails.jsx'
import Login from '../pages/Login.jsx'
import Register from '../pages/Register.jsx'
import Profile from '../pages/dashboard/Profile.jsx'
import DashboardCourses from '../pages/dashboard/Courses.jsx'
import DashboardRequests from '../pages/dashboard/Requests.jsx'
import DashboardFavorites from '../pages/dashboard/Favorites.jsx'
import DashboardTeachers from '../pages/dashboard/Teachers.jsx'
import Gallery from '../pages/dashboard/Gallery.jsx'
import Settings from '../pages/dashboard/Settings.jsx'
import Community from '../pages/dashboard/Community.jsx'
import Announcements from '../pages/dashboard/Announcements.jsx'
import Marks from '../pages/dashboard/Marks.jsx'
import AdminDashboard from '../pages/AdminDashboard.jsx'
import { studentProfileUpdatedEventName, verifyStudentSession } from '../services/database.js'
import Footer from '../components/Footer.jsx'
import { useLocale } from '../contexts/LocaleContext.jsx'

function StudentDashboardRoute() {
	const { t } = useLocale()
	const [retryCount, setRetryCount] = useState(0)
	const [access, setAccess] = useState({ status: 'checking' })

	useEffect(() => {
		let isCurrent = true
		verifyStudentSession().then((session) => {
			if (isCurrent) setAccess(session ? { status: 'granted', student: session } : { status: 'denied' })
		}).catch((error) => {
			if (isCurrent) setAccess({ status: 'error', message: error.message })
		})
		return () => { isCurrent = false }
	}, [retryCount])

	useEffect(() => {
		const updateStudentProfile = (event) => {
			const profile = event.detail
			if (!profile) return
			setAccess((current) => current.status === 'granted'
				? { ...current, student: { ...current.student, studentName: profile.name, phone: profile.phone } }
				: current)
		}
		window.addEventListener(studentProfileUpdatedEventName, updateStudentProfile)
		return () => window.removeEventListener(studentProfileUpdatedEventName, updateStudentProfile)
	}, [])

	if (access.status === 'checking') return <main className="dashboard-main dashboard-access-state"><p role="status">{t('جارٍ التحقق من جلسة الطالب...')}</p><Footer /></main>
	if (access.status === 'error') return <main className="dashboard-main dashboard-access-state"><p className="form-message" role="alert">{t(access.message)}</p><button className="button button-dark" type="button" onClick={() => { setAccess({ status: 'checking' }); setRetryCount((count) => count + 1) }}>{t('إعادة المحاولة')}</button><Footer /></main>
	if (access.status === 'denied') return <Navigate to="/login" replace />
	return <DashboardLayout student={access.student} />
}

export default function AppRouter() {
	return (
		<BrowserRouter>
			<Routes>
				<Route path="/admin" element={<AdminDashboard />} />
				<Route element={<PublicLayout />}>
					<Route path="/" element={<Home />} />
					<Route path="/grades/:gradeId" element={<GradeDetails />} />
					<Route path="/courses" element={<Courses />} />
					<Route path="/courses/:courseId" element={<CourseDetails />} />
					<Route path="/teachers" element={<Teachers />} />
					<Route path="/teachers/:teacherId" element={<TeacherDetails />} />
					<Route path="/login" element={<Login />} />
					<Route path="/register" element={<Register />} />
				</Route>
				<Route path="/dashboard" element={<StudentDashboardRoute />}>
					<Route index element={<Navigate to="profile" replace />} />
					<Route path="profile" element={<Profile />} />
					<Route path="courses" element={<DashboardCourses />} />
					<Route path="requests" element={<DashboardRequests />} />
					<Route path="favorites" element={<DashboardFavorites />} />
					<Route path="teachers" element={<DashboardTeachers />} />
					<Route path="gallery" element={<Gallery />} />
					<Route path="settings" element={<Settings />} />
					<Route path="feed" element={<Community />} />
					<Route path="saved" element={<Community savedOnly />} />
					<Route path="announcements" element={<Announcements />} />
					<Route path="marks" element={<Marks />} />
				</Route>
				<Route path="*" element={<Navigate to="/" replace />} />
			</Routes>
		</BrowserRouter>
	)
}
