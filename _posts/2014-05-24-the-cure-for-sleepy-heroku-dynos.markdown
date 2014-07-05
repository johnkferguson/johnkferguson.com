---
layout: post
title: "The Cure for Sleepy Heroku Dynos"
date: 2014-05-24 21:21
comments: true
categories:
---

If your application on Heroku has been having slow initial page load times, the
most likely cause is a
[sleeping dyno](https://devcenter.heroku.com/articles/dynos#dyno-sleeping).

Dynos are Heroku's own lightweight virtualized containers that are used to house
and serve your app. When using only one dyno, such as with Heroku's free plan,
Heroku will put your dyno to sleep when there has no been no activity on your
app for over an hour. This often occurs when no visitors have been to your site
in a while.

When Heroku puts your dyno to sleep, it takes its allotted resources, such as
processors and memory, and re-allocates them elsewhere. While sleeping, your
application is idle and is unable to do anything. However, once a new request
comes back into your application, Heroku will give back the resources to your
app. During this process, your app will go through the process of booting up
and any visitor to your site will have to endure a very long initial page load
time.

To prevent this from happening, all that has to be done is to automatically
trigger a http request to your site at least once a hour. With such a scheduled
request, there will be no opportunity for you app to go to sleep and for users
to experience such slow page load times.

There are various ways to ping your site via a scheduled http request, such as
through using a [cron](http://en.wikipedia.org/wiki/Cron) job that curls your
app, [New Relic's availability monitoring](https://docs.newrelic.com/docs/alert-policies/availability-monitoring)
or [various](http://uptimerobot.com/) [other](http://kaffeine.herokuapp.com/)
[free services](http://unidler.herokuapp.com/).

One of the simplest solutions out there is to use Heroku's own
[Heroku Scheduler](https://addons.heroku.com/scheduler) to set up a repeating
curl request directed at your application's url. This post will cover how to
properly configure such a solution.


## Setting up Heroku Scheduler

Assuming you already have an app set up on Heroku, you'll need to get the Heroku
Scheduler add-on.

To do so, from within your app's page on heroku, click on the Get Add-ons button.

![Add-on Button](/assets/images/sleepy_dynos/heroku_get_add_ons.png)

Scroll down the page to the Workers and Queueing section of the Add-Ons page
and click on Heroku Scheduler.

![Workers and Queueing](/assets/images/sleepy_dynos/heroku_workers_and_queueing.png)

On the Heroku Scheduler's add-on page, select the app you'd like to use the
scheduler with and click the add button.

![Heroku Scheduler Page](/assets/images/sleepy_dynos/heroku_scheduler_page.png)

Navigate to your App's Page in Heroku and click on the Heroku Scheduler icon.

![Heroku Add Ons List](/assets/images/sleepy_dynos/heroku_add_ons_list.png)

From within the Heroku Scheduler's configuration page, click on the add job
button. Next, enter in the url of the app you'd like to prevent from sleeping
(in this example I've used `my-app.herokuapp.com`). This should be a page that
is publicly accessible. Finally, set the frequency to 'Every 10 minutes'
and click Save.

![Heroku Scheduler Configuration](/assets/images/sleepy_dynos/heroku_scheduler_config.png)

That's it, you're all set. Your Heroku app won't go to sleep again.

If you'd like to explore other options on how to keep your app from going to
sleep, check out
[this question](http://stackoverflow.com/questions/5480337/easy-way-to-prevent-heroku-idling)
on StackOverflow.
