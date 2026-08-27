import { Hono } from 'hono';
import auth from './auth';
import players from './players';
import zones from './zones';
import events from './events';
import teams from './teams';
import scores from './scores';
import golfCourses from './golfCourses';

const app = new Hono<{ Bindings: Env }>();

app.route('/api/auth', auth);
app.route('/api/players', players);
app.route('/api/zones', zones);
app.route('/api/events', events);
app.route('/api/teams', teams);
app.route('/api/scores', scores);
app.route('/api/golf-courses', golfCourses);

app.onError((err, c) => {
	console.error(err);
	return c.json({ message: err.message || 'Internal error' }, 500);
});

export default app;
