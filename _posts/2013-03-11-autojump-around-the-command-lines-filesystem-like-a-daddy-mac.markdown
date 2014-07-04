---
layout: post
title: "Autojump Around the Command Line's Filesystem Like a Daddy Mac"
date: 2013-03-11 00:05
comments: true
categories: [Command Line Tools, Productivity]
---
![Kriss Kross will make you… Jump Jump](/assets/assets/images/autojump/kriss_kross.jpg)

[Autojump](https://github.com/joelthelion/Autojump) is a sweet little command line tool that'll have your rocking your clothes backwards and hopping around your computer's directories faster than a pair of 14-year old rappers.

Before Autojump, the way we moved between distant directories was to `cd` through its entire file path. As an example, let's say we wanted to move from our octopress directory to our main Documents directory. Using the typical `cd` route, it would look something like this:

{% highlight bash %}
$ pwd
/Users/MyUsername/Development/code/octopress
$ cd /Users/MyUsername/Documents
$ pwd
/Users/MyUsername/Documents
{% endhighlight %}

With Autojump, the above can be accomplished with a lot less keystrokes:

{% highlight bash %}
$ pwd
/Users/MyUsername/Development/code/octopress
$ j doc
$ pwd
/Users/MyUsername/Documents
{% endhighlight %}

The way Autojump does this is by matching our input against a ranked database of the directories we spend time in most. We'll delve deeper into how Autojump works later and also cover how to best use it, but first, let's install Autojump.

## Installation
If you're on OS X, the best way to install Autojump is via [Homebrew](http://mxcl.github.com/homebrew/)w. If you'd prefer to do it manually or on a Linux machine, check out [Autojump's documentation](https://github.com/joelthelion/Autojump#readme) on their Github repo.

If you already have Homebrew installed, then skip to step 2 to install or update Python. If you already have Homebrew and Python v2.6+ installed, then move on to step 3.

1. Homebrew is an awesome package manager for OS X that can install any of the stuff you need that didn't come with your Mac. If you don't already have Homebrew, just enter the following code into a terminal prompt:

{% highlight bash %}
ruby -e "$(curl -fsSL https://raw.github.com/mxcl/homebrew/go)"
{% endhighlight %}

For other installation options and more info, check out [Homebrew's documentation](https://github.com/mxcl/homebrew/wiki).

2. Now, we want to check if we have Python v2.6+ installed. To do so, just type the following into the terminal:
`python -V`
This will give you the version number of Python. If it's less than 2.6, then run the following in the terminal `brew install python`
3. Since we already have Python and Homebrew installed, all we need to do is get Autojump. To do that, enter the following into the terminal `brew install autojump`

## Usage

### Jumping Around

So we've got Autojump installed, but we can't start jumping around between directories just yet. First Autojump needs to build a database of the directories we spend time in most. Autojump starts doing this from the moment it is installed. However, it will have no memory of what directories we visited prior to its installation and hence will have no database initially.

To demonstrate this, let's see what Autojump's database of directories looks like right after installation. This can be done through the following terminal command: `j -s`

Since we haven't changed directories yet, Autojump's database is empty. So let's change directories to start populating Autojump's database:

{% highlight bash %}
$ cd /Users/MyUsername/Downloads
{% endhighlight %}

Now when we use `j -s`, we should see the following:

{% highlight bash %}
20.0: /Users/MyUsername/Downloads
Total key weight: 20. Number of stored dirs: 1
{% endhighlight %}

Let's move to the desktop. Since it's not in the Autojump database, we can't jump to it yet. So we'll cd into it:

{% highlight bash %}
$ cd /Users/MyUsername/Desktop
{% endhighlight %}

We'll run `j -s` again to see Autojump's database:

{% highlight bash %}
20.0: /Users/MyUsername/Downloads
20.0 /Users/MyUsername/Desktop
Total key weight: 40. Number of stored dirs: 2
{% endhighlight %}

Now Autojump has 2 entries in its database and we can jump to them from **anywhere** in our filesystem. To move to the Downloads directory, either of the following commands would work `j dow` or `j do`.

Once in the Downloads directory, let's hop back to the desktop with either of the following commands `j des` or `j de`. Of course, we could enter more characters to accomplish the same thing. This often becomes necessary if our database is large and our target directory is ranked low.

### Understanding Rank

As we continue to use the command line as normal, Autojump's database will keep populating with new directories. In addition, Autojump will increase the rank of directories we spend time in most, while decreasing the rank of directories we don't visit that often. After using Autojump for a while, our database might look like the following:

{% highlight bash %}
4.8: /Users/MyUsername/Library
12.7: /Users/MyUsername/Music
13.1: /Users/MyUsername/Documents
18.0: /Users/MyUsername/Development/code/octopress/public
23.3: /Users/MyUsername/Dropbox
24.0: /Users/MyUsername/Development/code/octopress/source
28.5: /Users/MyUsername/Pictures
32.1: /Users/MyUsername/Development
33.8: /Users/MyUsername/Development/code/octopress
36.0: /Users/MyUsername/Desktop
45.7: /Users/MyUsername/Downloads
58.0: /Users/MyUsername/Development/code/octopress/source/_posts
64.1: /Users/MyUsername/Development/code
Total key weight: 394.1. Number of stored dirs: 13
{% endhighlight %}

In the above, `/Users/MyUsername/Development/code` has a key weight of 64.1. A directory's key weight determines its rank. A higher key weight means a higher rank, while a lower key weight means a lower rank. Rank is used when making a fuzzy match between a user's input and Autojump's database of directories. Higher ranked directories are matched against the user's input first before other lower ranked directories.

### Tab Auto-completion

Autojump also supports tab auto-completion. To use tab auto-completion, type in the first few letters of the directory you want to visit and press tab to have the complete directory filled in. This is great to use if you are uncertain about what directory Autojump will hop to based upon your input. In addition, when there are multiple possible directories after tab is pressed, Autojump will display all such options. For example:
`j d` + **TAB** will reveal a list of possible directories:

{% highlight bash %}
d__1__/Users/MyUsername/Development/code
d__2__/Users/MyUsername/Downloads
d__3__/Users/MyUsername/Development
d__4__/Users/MyUsername/Dropbox
d__5__/Users/MyUsername/Documents
{% endhighlight %}

Our command line prompt will then read as: `$ j d_` All we have to do is enter in the number of the directory we want to go to and press **TAB** to have it auto-completed and then press enter to jump to it.

### Jumping to a directory and listing its files

We can extend the functionality of autojump to list the files of a directory we jump to by adding a simple function to our bash profile. Here's how:

1. Open your Bash profile in your favorite text editor. Your bash profile will typically be found in your home directory as a hidden file, often with the file path of `/Users/'Your_Name_Here'/.bash_profile`
2. Once in your Bash profile, add the following line `function jl(){ j "$@" && ls; }`
3. Source your terminal to reflect the changes to your Bash profile. This can be done by entering `source /Users/'Your_Name_Here'/.bash_profile` into the terminal.

Now you can use the alias `jl` to jump into a directory and `ls` all of its contents.

## JUMP JUMP!

With Autojump all configured, you're now the Filesystem Mac Daddy and the Command Line Daddy Mac.

![JUMP JUMP!!!](/assets/assets/images/autojump/kriss_kross_backwards.png)
