---
layout: post
title: "Five Ways to Get More Out of Pry"
date: 2013-05-14 00:20
---
![Pry](./pry_logo_350.png)

## What is Pry?

Pry is an awesome IRB replacement that offers a ton of powerful features.
This post will highlight five of the most useful, so you can get more out of Pry.


### Getting Started

To install Pry, type the following into your terminal:

```bash
$ gem install pry
```

To start Pry from the terminal, simply enter in Pry like so:

```bash
$ pry
[1] pry(main)>
```

Once in Pry, you can start interacting with Ruby as you would with irb,
but with other added features.


### 1. Use Shell Commands while in Pry

When inside a Pry session, it's possible to execute normal shell commands,
such as `pwd`, `cd`, or `ls`. You can even run more advanced commands like
`bundle` or even run rails commands like `rails generate` or `rails server`.

To do so, simply prepend a `.` to the start of the shell command you would
like to run. Here's some examples:

```bash
[1] pry(main)> .pwd
/Users/Username
[2] pry(main)> .ls
Desktop   Development Dropbox   Movies    Pictures
Development Downloads Library   Music
[3] pry(main)> .cd Development
[4] pry(main)> .pwd
/Users/Username/Development
[5] pry(main)> .ls
ruby_rocks.rb      Folder
```


### 2. Make Full Use of Pry's Methods

Pry has a bunch of different methods that can really help you understand your
code. Here are a few of the best:

1.`cd` lets you move into a new context, such as an object or scope. Here's
how it looks in action

```bash
[1] pry(main)> self
main
[2] pry(main)> class Dog
[2] pry(main)*   def bark
[2] pry(main)*     puts "woof"
[2] pry(main)*   end
[2] pry(main)* end
nil
[3] pry(main)> cd Dog
[4] pry(Dog):1> self
Dog < Object
```

In the above example, we are now inside the Dog class object. We can perform
other actions while inside an object, such as `ls`.

2.`ls` allows you to list all the various methods that an object can perform.
We can see how it works by continuing our example

```bash
[5] pry(Dog):1> ls
Object.methods: yaml_tag
Dog#methods: bark
locals: _  __  _dir_  _ex_  _file_  _in_  _out_  _pry_
```

As we can see, typing `ls` shows us what methods an object has. In
this example, we see that Dog has the `bark` method.

3.`show-method` lets us see the original code of a method. This can be
of great value when trying to understand what it is a method does.
Continuing with our example, we can see the original bark method.

```bash
[6] pry(Dog):1> show-method bark
From: (pry) @ line 3:
Owner: Dog
Visibility: public
Number of lines: 3
def bark
  puts "woof"
end
```

4.`nesting` can be used to help orient yourself in understanding the
scope and inheritance of the current object. Here's how `nesting`
works in our ongoing example.

```bash
[7] pry(Dog):1> nesting
Nesting status:
--
0 main (Pry top level)
1 Dog
```

5. Finally, `help` can list out all the other methods that Pry offers
that won't be covered in this blog post. Try it out within Pry yourself
to see all the different options.


### 3. Dive Into Running Code with binding.pry

`binding.pry` can be used to start a Pry session at any point in your
application. This can be great to use to really dive into code and
understand scope, methods and any sort of errors. Here's how it works.

Let's say we have a file, pry-example.rb, with the following code:

```ruby
require 'pry'

class Example
  def how_binding_works
    binding.pry
  end
end

demonstration = Example.new
demonstration.how_binding_works
```

We then run the file within the terminal:

```bash
$ ruby pry-example.rb
```

After running the file, we are then put into the code at the point
where `binding.pry` is located.

```bash
From: /Users/Username/pry-example.rb @ line 6 Example#how_binding_works:

    5: def how_binding_works
 => 6:   binding.pry
    7: end

[1] pry(#<Example>)>
```

We can then execute whatever commands we want in order to understand
this place in the code.

```bash
[1] pry(#<Example>)> ls
Example#methods: how_binding_works
locals: _  __  _dir_  _ex_  _file_  _in_  _out_  _pry_
[2] pry(#<Example>)> self
#<Example:0x007fde422f8fc8>
```


### 4. Use Pry with Rails

It's possible to use Pry with your rails app instead of the default rails
console. There are a few options for how to do so. One of the simplest is to
use the [pry-rails](https://github.com/rweng/pry-rails) gem with your
application. Doing so will cause `rails console` to load Pry instead of IRB,
yet will still retain all of your rails informatin, such as your models,
and all the information in your database.

To set up your rails app to use Pry, simply add the following code to your
gemfile:

```ruby
gem 'pry-rails', :group => :development
```

Then run `bundle install` and the next time you invoke the `rails console`,
you'll be brought into Pry.

Pry-rails also comes with two additional methods that extend the functionality
of Pry with your rails app. They are:

1. `show-routes` - This shows all of your routes for your application in the
same way that typing `rake routes` in the shell would do.

2. `show-models` - This lists all of the models along with all of their column
name. It is the same as if viewing the schema.rb of your application. However,
in addition, it will also show any associations your models have, such as
`belongs_to` or `has_many`.


### 5. Explore All of Pry's Awesome Documentation & Resources

Pry has some of the best documentation and resources around. Here are some of
the best places to start with to get a deeper understanding of Pry.

1. [Pry's Main Site](http://pryrepl.org/) gives a great overview of the project.

2. The [Pry Intoductory Screencast](http://vimeo.com/26391171) is easy to
follow and does a wonderful job of demonstrating the power of Pry.

3. The RailsCasts episode, [Pry with Rails](http://railscasts.com/episodes/280-pry-with-rails),
covers some great ways to use Pry with Rails.
4. The [Pry Wiki](https://github.com/pry/pry/wiki) on [Pry's Github Repository](https://github.com/pry/pry)
is fantastic and provides links to other worthwhile resources as well as clear
documentation on all of Pry's capabilities.
